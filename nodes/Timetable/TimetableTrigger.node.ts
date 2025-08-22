import moment from 'moment-timezone';
import type {
	ITriggerFunctions,
	INodeType,
	INodeTypeDescription,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

import { shouldTriggerNow, getNextRunTime } from './GenericFunctions';
import type { TimetableConfig } from './SchedulerInterface';

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
						default: 12,
						description: 'Hour when the workflow should trigger (24-hour format)',
						options: [
									{
										name: '00:00 (Midnight)',
										value: 0
									},
									{
										name: '01:00',
										value: 1
									},
									{
										name: '02:00',
										value: 2
									},
									{
										name: '03:00',
										value: 3
									},
									{
										name: '04:00',
										value: 4
									},
									{
										name: '05:00',
										value: 5
									},
									{
										name: '06:00',
										value: 6
									},
									{
										name: '07:00',
										value: 7
									},
									{
										name: '08:00',
										value: 8
									},
									{
										name: '09:00',
										value: 9
									},
									{
										name: '10:00',
										value: 10
									},
									{
										name: '11:00',
										value: 11
									},
									{
										name: '12:00 (Noon)',
										value: 12
									},
									{
										name: '13:00',
										value: 13
									},
									{
										name: '14:00',
										value: 14
									},
									{
										name: '15:00',
										value: 15
									},
									{
										name: '16:00',
										value: 16
									},
									{
										name: '17:00',
										value: 17
									},
									{
										name: '18:00',
										value: 18
									},
									{
										name: '19:00',
										value: 19
									},
									{
										name: '20:00',
										value: 20
									},
									{
										name: '21:00',
										value: 21
									},
									{
										name: '22:00',
										value: 22
									},
									{
										name: '23:00',
										value: 23
									},
					]
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
			if (!triggerHoursData.hours || !Array.isArray(triggerHoursData.hours)) {
				throw new NodeOperationError(
					this.getNode(),
					'Invalid trigger hours configuration'
				);
			}

			hourConfigs = triggerHoursData.hours
				.filter(item => typeof item.hour === 'number' && item.hour >= 0 && item.hour <= 23)
				.map(item => {
					// Validate day of week
					const dayOfWeek = item.dayOfWeek || 'ALL';
					const validDays = ['ALL', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
					if (!validDays.includes(dayOfWeek)) {
						throw new NodeOperationError(
							this.getNode(),
							`Invalid day of week for hour ${item.hour}: ${dayOfWeek} (must be one of: ${validDays.join(', ')})`
						);
					}

					// Validate minute configuration
					const minute = item.minute || 'random';
					if (minute !== 'random') {
						const minuteNum = Number(minute);
						if (isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid minute for hour ${item.hour}: ${minute} (must be 'random' or 0-59)`
							);
						}
					}

					return { hour: item.hour, minute, dayOfWeek };
				})
				.sort((a, b) => a.hour - b.hour);
				
			if (hourConfigs.length === 0) {
				throw new NodeOperationError(
					this.getNode(),
					'At least one valid hour must be selected'
				);
			}
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
		console.log(`[TimetableTrigger] Configuration loaded at ${new Date().toISOString()}:`);
		console.log(`[TimetableTrigger] Timezone: ${timezone}`);
		console.log(`[TimetableTrigger] Hour configs:`, config.hourConfigs.map(hc => ({
			hour: hc.hour,
			minute: hc.minute ?? 'random',
			dayOfWeek: hc.dayOfWeek,
			minuteMode: hc.minuteMode
		})));
		
		// Compute and log next trigger time
		try {
			const nowForNext = moment.tz(timezone).toDate();
			const nextRun = getNextRunTime(nowForNext, config);
			console.log(`[TimetableTrigger] Next scheduled trigger: ${nextRun.candidate.toISOString()} (${moment.utc(nextRun.candidate).format('YYYY-MM-DD HH:mm:ss')} UTC)`);
		} catch (error) {
			console.log(`[TimetableTrigger] Error computing next run time: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}

		const executeTrigger = () => {
			const currentTime = moment.tz(timezone).toDate();
			const currentTimeUtc = moment.utc(currentTime);
			const shouldTrigger = shouldTriggerNow(staticData.lastTriggerTime, config, timezone);
			
			// Debug logging for every check
			console.log(`[TimetableTrigger] Trigger check at ${currentTimeUtc.format('YYYY-MM-DD HH:mm:ss')} UTC (${currentTime.toISOString()})`);
			console.log(`[TimetableTrigger] Current time in timezone ${timezone}: ${moment.tz(timezone).format('YYYY-MM-DD HH:mm:ss')}`);
			console.log(`[TimetableTrigger] Last trigger time: ${staticData.lastTriggerTime ? new Date(staticData.lastTriggerTime).toISOString() : 'never'}`);
			console.log(`[TimetableTrigger] Should trigger: ${shouldTrigger}`);
			
			if (!shouldTrigger) {
				const nextRun = getNextRunTime(currentTime, config);
				console.log(`[TimetableTrigger] Not triggering. Next scheduled: ${moment.utc(nextRun.candidate).format('YYYY-MM-DD HH:mm:ss')} UTC`);
				return;
			}

			console.log(`[TimetableTrigger] ✓ TRIGGERING WORKFLOW at ${currentTimeUtc.format('YYYY-MM-DD HH:mm:ss')} UTC`);
			staticData.lastTriggerTime = Date.now();
			
			const momentTz = moment.tz(timezone);
			const nextRun = getNextRunTime(momentTz.toDate(), config);
			
			const resultData = {
				timestamp: momentTz.toISOString(true),
				'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
				'Readable time': momentTz.format('h:mm:ss a'),
				'Day of week': momentTz.format('dddd'),
				Year: momentTz.format('YYYY'),
				Month: momentTz.format('MMMM'),
				'Day of month': momentTz.format('DD'),
				Hour: momentTz.format('HH'),
				Minute: momentTz.format('mm'),
				Second: momentTz.format('ss'),
				Timezone: `${timezone} (UTC${momentTz.format('Z')})`,
				'Trigger hours': hourConfigs.map(hc => ({
					hour: hc.hour,
					minute: hc.minute,
					dayOfWeek: hc.dayOfWeek
				})),
				'Next scheduled': nextRun.candidate.toISOString(),
				'Next scheduled readable': moment.tz(nextRun.candidate, timezone).format('MMMM Do YYYY, h:mm:ss a'),
				'Manual execution': false
			};

			this.emit([this.helpers.returnJsonArray([resultData])]);
		};

		if (this.getMode() !== 'manual') {
			try {
				// Use every minute cron to check conditions frequently
				console.log(`[TimetableTrigger] Registering cron job to run every minute for condition checking`);
				this.helpers.registerCron('* * * * *' as any, () => executeTrigger());
			} catch (error) {
				throw new NodeOperationError(
					this.getNode(),
					`Failed to create schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
				);
			}
			return {};
		} else {
			// For manual execution, trigger immediately without condition checks
			const manualTriggerFunction = async () => {
				const momentTz = moment.tz(timezone);
				const currentTimeUtc = moment.utc();
				
				console.log(`[TimetableTrigger] ✓ MANUAL EXECUTION at ${currentTimeUtc.format('YYYY-MM-DD HH:mm:ss')} UTC`);
				console.log(`[TimetableTrigger] Manual execution in timezone ${timezone}: ${momentTz.format('YYYY-MM-DD HH:mm:ss')}`);
				
				const nextRun = getNextRunTime(momentTz.toDate(), config);
				console.log(`[TimetableTrigger] Next scheduled after manual execution: ${moment.utc(nextRun.candidate).format('YYYY-MM-DD HH:mm:ss')} UTC`);
				
				const resultData = {
					timestamp: momentTz.toISOString(true),
					'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
					'Readable time': momentTz.format('h:mm:ss a'),
					'Day of week': momentTz.format('dddd'),
					Year: momentTz.format('YYYY'),
					Month: momentTz.format('MMMM'),
					'Day of month': momentTz.format('DD'),
					Hour: momentTz.format('HH'),
					Minute: momentTz.format('mm'),
					Second: momentTz.format('ss'),
					Timezone: `${timezone} (UTC${momentTz.format('Z')})`,
					'Trigger hours': hourConfigs.map(hc => ({
						hour: hc.hour,
						minute: hc.minute,
						dayOfWeek: hc.dayOfWeek
					})),
					'Next scheduled': nextRun.candidate.toISOString(),
					'Next scheduled readable': moment.tz(nextRun.candidate, timezone).format('MMMM Do YYYY, h:mm:ss a'),
					'Manual execution': true
				};

				this.emit([this.helpers.returnJsonArray([resultData])]);
			};

			return { manualTriggerFunction };
		}
	}
}