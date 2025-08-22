import moment from 'moment-timezone';
import type {
	ITriggerFunctions,
	INodeType,
	INodeTypeDescription,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

import { shouldTriggerNow, getNextRunTime, createResultData, TimetableLogger } from './GenericFunctions';
import type { TimetableConfig } from './SchedulerInterface';

// Generate hour options dynamically instead of hardcoding 98 lines
function generateHourOptions() {
	return Array.from({ length: 24 }, (_, i) => ({
		name: i === 0 ? '00:00 (Midnight)' : 
			  i === 12 ? '12:00 (Noon)' : 
			  `${i.toString().padStart(2, '0')}:00`,
		value: i
	}));
}

// Parse and validate trigger configuration
function parseAndValidateConfig(
	triggerHoursData: any,
	getNode: () => any
): Array<{ hour: number; minute: string; dayOfWeek?: string }> {
	if (!triggerHoursData.hours || !Array.isArray(triggerHoursData.hours)) {
		throw new NodeOperationError(
			getNode(),
			'Invalid trigger hours configuration'
		);
	}

	const hourConfigs = triggerHoursData.hours
		.filter((item: any) => typeof item.hour === 'number' && item.hour >= 0 && item.hour <= 23)
		.map((item: any) => {
			// Validate day of week
			const dayOfWeek = item.dayOfWeek || 'ALL';
			const validDays = ['ALL', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
			if (!validDays.includes(dayOfWeek)) {
				throw new NodeOperationError(
					getNode(),
					`Invalid day of week for hour ${item.hour}: ${dayOfWeek} (must be one of: ${validDays.join(', ')})`
				);
			}

			// Validate minute configuration
			const minute = item.minute || 'random';
			if (minute !== 'random') {
				const minuteNum = Number(minute);
				if (isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) {
					throw new NodeOperationError(
						getNode(),
						`Invalid minute for hour ${item.hour}: ${minute} (must be 'random' or 0-59)`
					);
				}
			}

			return { hour: item.hour, minute, dayOfWeek };
		})
		.sort((a: any, b: any) => a.hour - b.hour);
		
	if (hourConfigs.length === 0) {
		throw new NodeOperationError(
			getNode(),
			'At least one valid hour must be selected'
		);
	}

	return hourConfigs;
}

// Create the execution trigger function
function createExecuteTrigger(
	config: TimetableConfig, 
	timezone: string, 
	staticData: { lastTriggerTime?: number }, 
	hourConfigs: Array<{ hour: number; minute: string; dayOfWeek?: string }>,
	emit: (data: any) => void,
	helpers: any
) {
	return () => {
		const currentTime = moment.tz(timezone).toDate();
		const shouldTrigger = shouldTriggerNow(staticData.lastTriggerTime, config, timezone);
		
		TimetableLogger.logTriggerCheck(currentTime, timezone, staticData.lastTriggerTime, shouldTrigger);
		
		if (!shouldTrigger) {
			const nextRun = getNextRunTime(currentTime, config);
			TimetableLogger.logSkipTrigger(nextRun.candidate);
			return;
		}

		TimetableLogger.logExecution('automatic', currentTime);
		staticData.lastTriggerTime = Date.now();
		
		const momentTz = moment.tz(timezone);
		const nextRun = getNextRunTime(momentTz.toDate(), config);
		const resultData = createResultData(momentTz, timezone, hourConfigs, nextRun, false);

		emit([helpers.returnJsonArray([resultData])]);
	};
}

// Create the manual trigger function
function createManualTrigger(
	config: TimetableConfig,
	timezone: string, 
	hourConfigs: Array<{ hour: number; minute: string; dayOfWeek?: string }>,
	emit: (data: any) => void,
	helpers: any
) {
	return async () => {
		const momentTz = moment.tz(timezone);
		
		TimetableLogger.logExecution('manual', momentTz.toDate(), timezone);
		
		const nextRun = getNextRunTime(momentTz.toDate(), config);
		TimetableLogger.logNextScheduled(nextRun.candidate);
		
		const resultData = createResultData(momentTz, timezone, hourConfigs, nextRun, true);
		emit([helpers.returnJsonArray([resultData])]);
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
		}) as { hours: Array<{ hour: number; minute: string; dayOfWeek?: string }> };
		
		const timezone = this.getTimezone();
		const staticData = this.getWorkflowStaticData('node') as {
			lastTriggerTime?: number;
		};

		// Parse and validate trigger hours
		let hourConfigs: Array<{ hour: number; minute: string; dayOfWeek?: string }>;
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
				this.helpers.registerCron('* * * * *' as any, executeTrigger);
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
				this.emit.bind(this),
				this.helpers
			);

			return { manualTriggerFunction };
		}
	}
}