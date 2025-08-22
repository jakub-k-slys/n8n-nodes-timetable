import moment from 'moment-timezone';
import type {
	ITriggerFunctions,
	INodeType,
	INodeTypeDescription,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

import { shouldTriggerNow, getNextRunTime, createResultData, TimetableLogger } from './GenericFunctions';
import type { 
	TimetableConfig, 
	RawHourConfig, 
	RawTriggerHoursData,
	StaticData,
	NodeHelpers
} from './SchedulerInterface';
import { RawTriggerHoursDataCodec } from './SchedulerInterface';
import { isRight } from 'fp-ts/lib/Either';
import { PathReporter } from 'io-ts/lib/PathReporter';

// Generate hour options dynamically instead of hardcoding 98 lines
function generateHourOptions() {
	return Array.from({ length: 24 }, (_, i) => ({
		name: i === 0 ? '00:00 (Midnight)' : 
			  i === 12 ? '12:00 (Noon)' : 
			  `${i.toString().padStart(2, '0')}:00`,
		value: i
	}));
}

// Parse and validate trigger configuration using io-ts
function parseAndValidateConfig(
	triggerHoursData: unknown,
	getNode: () => any
): RawHourConfig[] {
	const validation = RawTriggerHoursDataCodec.decode(triggerHoursData);
	
	if (!isRight(validation)) {
		const errors = PathReporter.report(validation).join('; ');
		throw new NodeOperationError(
			getNode(),
			`Invalid trigger configuration: ${errors}`,
			{
				description: 'Please check your hour selections, minute values (must be "random" or 0-59), and day of week settings'
			}
		);
	}

	const { hours } = validation.right;
	
	if (hours.length === 0) {
		throw new NodeOperationError(
			getNode(),
			'At least one valid hour must be selected',
			{
				description: 'Please add at least one trigger hour using the dropdown menu'
			}
		);
	}

	// Sort by hour for consistent ordering
	return hours.sort((a, b) => a.hour - b.hour);
}

// Create the execution trigger function
function createExecuteTrigger(
	config: TimetableConfig, 
	timezone: string, 
	staticData: StaticData, 
	hourConfigs: RawHourConfig[],
	emit: (data: any) => void,
	helpers: NodeHelpers
) {
	return () => {
		try {
			const currentTime = moment.tz(timezone).toDate();
			const shouldTrigger = shouldTriggerNow(staticData.lastTriggerTime, config, timezone);
			
			TimetableLogger.logTriggerCheck(currentTime, timezone, staticData.lastTriggerTime, shouldTrigger);
			
			if (!shouldTrigger) {
				try {
					const nextRun = getNextRunTime(currentTime, config);
					TimetableLogger.logSkipTrigger(nextRun.candidate);
				} catch (error) {
					TimetableLogger.logError('computing next run time for skip', error instanceof Error ? error : 'Unknown error');
				}
				return;
			}

			TimetableLogger.logExecution('automatic', currentTime);
			staticData.lastTriggerTime = Date.now();
			
			try {
				const momentTz = moment.tz(timezone);
				const nextRun = getNextRunTime(momentTz.toDate(), config);
				const resultData = createResultData(momentTz, timezone, hourConfigs, nextRun, false);
				emit([helpers.returnJsonArray([resultData])]);
			} catch (error) {
				TimetableLogger.logError('creating workflow output', error instanceof Error ? error : 'Unknown error');
				// Emit minimal data without next run time to ensure workflow still executes
				const momentTz = moment.tz(timezone);
				const fallbackData = { 
					timestamp: momentTz.toISOString(true),
					'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
					'Readable time': momentTz.format('h:mm:ss a'),
					'Manual execution': false,
					error: 'Failed to compute next run time - workflow executed with fallback data'
				};
				emit([helpers.returnJsonArray([fallbackData])]);
			}
		} catch (error) {
			TimetableLogger.logError('in execution trigger', error instanceof Error ? error : 'Unknown error');
		}
	};
}

// Create the manual trigger function
function createManualTrigger(
	config: TimetableConfig,
	timezone: string, 
	hourConfigs: RawHourConfig[],
	helpers: NodeHelpers
) {
	return async () => {
		try {
			const momentTz = moment.tz(timezone);
			
			TimetableLogger.logExecution('manual', momentTz.toDate(), timezone);
			
			try {
				const nextRun = getNextRunTime(momentTz.toDate(), config);
				TimetableLogger.logNextScheduled(nextRun.candidate);
				
				const resultData = createResultData(momentTz, timezone, hourConfigs, nextRun, true);
				return helpers.returnJsonArray([resultData]);
			} catch (error) {
				TimetableLogger.logError('computing next run time for manual execution', error instanceof Error ? error : 'Unknown error');
				// Return minimal data without next run time for manual execution
				const fallbackData = { 
					timestamp: momentTz.toISOString(true),
					'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
					'Readable time': momentTz.format('h:mm:ss a'),
					'Manual execution': true,
					error: 'Failed to compute next run time - manual execution completed with fallback data'
				};
				return helpers.returnJsonArray([fallbackData]);
			}
		} catch (error) {
			TimetableLogger.logError('in manual trigger', error instanceof Error ? error : 'Unknown error');
			// Return fallback data on error
			const momentTz = moment.tz(timezone);
			const fallbackData = { 
				timestamp: momentTz.toISOString(true),
				'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
				'Readable time': momentTz.format('h:mm:ss a'),
				'Manual execution': true,
				error: 'Manual trigger execution failed'
			};
			return helpers.returnJsonArray([fallbackData]);
		}
	};
}

export class TimetableTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Timetable Trigger',
		name: 'timetableTrigger',
		icon: 'file:timetableTrigger.svg',
		group: ['trigger', 'schedule'],
		version: [1],
		description: 'Triggers the workflow at user-defined hours with optional minute randomization',
		eventTriggerDescription: '',
		activationMessage:
			'Your timetable trigger will now trigger executions at the hours you have selected.',
		defaults: {
			name: 'Timetable Trigger',
		},

		inputs: [],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName:
					'This workflow will run at the hours you select below once you <a data-key="activate">activate</a> it.<br><br>For testing, you can also trigger it manually: by going back to the canvas and clicking \'execute workflow\'',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Trigger Hours',
				name: 'triggerHours',
				type: 'fixedCollection',
				default: {
					hours: [
						{ hour: 12, minute: 'random', dayOfWeek: 'ALL' }
					]
				},
				placeholder: 'Add trigger hours',
				description: 'Select the hours when you want the workflow to trigger',
				typeOptions: {
					multipleValues: true,
					sortable: true,
				},
				options: [
					{
						name: 'hours',
						displayName: 'Hours',
						values: [
							{
						displayName: 'Day of Week',
						name: 'dayOfWeek',
						type: 'options',
						default: 'ALL',
						description: 'Select which day(s) of the week this trigger should run',
						options: [
									{
										name: 'Every Day',
										value: 'ALL',
									},
									{
										name: 'Friday',
										value: 'FRI',
									},
									{
										name: 'Monday',
										value: 'MON',
									},
									{
										name: 'Saturday',
										value: 'SAT',
									},
									{
										name: 'Sunday',
										value: 'SUN',
									},
									{
										name: 'Thursday',
										value: 'THU',
									},
									{
										name: 'Tuesday',
										value: 'TUE',
									},
									{
										name: 'Wednesday',
										value: 'WED',
									},
																]
							},
							{
						displayName: 'Hour',
						name: 'hour',
						type: 'options',
						default: '',
						description: 'Hour when the workflow should trigger (24-hour format)',
						options: generateHourOptions()
							},
							{
								displayName: 'Minute',
								name: 'minute',
								type: 'options',
								default: 'random',
								description: 'Select specific minute or random',
								options: [
									{
										name: 'Random',
										value: 'random',
									},
									...Array.from({ length: 60 }, (_, i) => ({
										name: i.toString().padStart(2, '0'),
										value: i.toString(),
									})),
								],
							},
					],
					},
				],
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const triggerHoursData = this.getNodeParameter('triggerHours', {
			hours: [
				{ hour: 12, minute: 'random', dayOfWeek: 'ALL' }
			]
		}) as RawTriggerHoursData;
		
		const timezone = this.getTimezone();
		const staticData = this.getWorkflowStaticData('node') as StaticData;

		// Parse and validate trigger hours
		let hourConfigs: RawHourConfig[];
		try {
			hourConfigs = parseAndValidateConfig(triggerHoursData, this.getNode.bind(this));
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				`Invalid trigger hours configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{
					description: 'Please add at least one trigger hour using the dropdown menu',
				}
			);
		}

		const config: TimetableConfig = {
			hourConfigs: hourConfigs.map(item => ({
				hour: item.hour,
				minute: item.minute === 'random' ? undefined : Number(item.minute),
				minuteMode: item.minute === 'random' ? 'random' : 'specific',
				dayOfWeek: item.dayOfWeek as any
			}))
		};

		// Debug logging for configuration
		const logConfigs = config.hourConfigs.map(hc => ({
			hour: hc.hour,
			minute: hc.minute ?? 'random',
			dayOfWeek: hc.dayOfWeek,
			minuteMode: hc.minuteMode
		}));
		
		// Compute and log next trigger time
		try {
			const nowForNext = moment.tz(timezone).toDate();
			const nextRun = getNextRunTime(nowForNext, config);
			TimetableLogger.logConfiguration(timezone, logConfigs, nextRun.candidate);
		} catch (error) {
			TimetableLogger.logConfiguration(timezone, logConfigs);
			TimetableLogger.logError('computing next run time', error instanceof Error ? error : 'Unknown error');
		}

		const executeTrigger = createExecuteTrigger(
			config, 
			timezone, 
			staticData, 
			hourConfigs,
			this.emit.bind(this),
			this.helpers
		);

		if (this.getMode() !== 'manual') {
			try {
				TimetableLogger.logCronRegistration();
				this.helpers.registerCron('* * * * * *' as any, executeTrigger);
			} catch (error) {
				throw new NodeOperationError(
					this.getNode(),
					`Failed to create schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
				);
			}
			return {};
		} else {
			const manualTriggerFunction = createManualTrigger(
				config,
				timezone, 
				hourConfigs,
				this.helpers
			);

			return { manualTriggerFunction };
		}
	}
}