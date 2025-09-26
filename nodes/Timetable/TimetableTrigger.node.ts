import type {
	ITriggerFunctions,
	INodeType,
	INodeTypeDescription,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError, randomInt } from 'n8n-workflow';
import moment from 'moment-timezone';

// Simplified Types
type DayOfWeek = 'ALL' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

interface HourConfig {
	hour: number;
	minute: number | 'random';
	dayOfWeek?: DayOfWeek;
}

interface TriggerSlots {
	hours: HourConfig[];
}

interface StaticData {
	lastTriggerTime?: number;
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
				name: 'triggerSlots',
				type: 'fixedCollection',
				default: {
					hours: [{ hour: 12, minute: 'random', dayOfWeek: 'ALL' }],
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
									{ name: 'Every Day', value: 'ALL' },
									{ name: 'Friday', value: 'FRI' },
									{ name: 'Monday', value: 'MON' },
									{ name: 'Saturday', value: 'SAT' },
									{ name: 'Sunday', value: 'SUN' },
									{ name: 'Thursday', value: 'THU' },
									{ name: 'Tuesday', value: 'TUE' },
									{ name: 'Wednesday', value: 'WED' },
								]
							},
							{
								displayName: 'Hour',
								name: 'hour',
								type: 'options',
								default: '',
								description: 'Hour when the workflow should trigger (24-hour format)',
								options: Array.from({ length: 24 }, (_, i) => ({
									name: i === 0 ? '00:00 (Midnight)' :
										  i === 12 ? '12:00 (Noon)' :
										  `${i.toString().padStart(2, '0')}:00`,
									value: i
								}))
							},
							{
								displayName: 'Minute',
								name: 'minute',
								type: 'options',
								default: 'random',
								description: 'Select specific minute or random',
								options: [
									{ name: 'Random', value: 'random' },
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

	// Utility Methods
	private static dayToNumber(day?: DayOfWeek): number | null {
		if (!day || day === 'ALL') return null;
		return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].indexOf(day);
	}

	private static matchesDay(date: Date, dayOfWeek?: DayOfWeek): boolean {
		const dayNumber = TimetableTrigger.dayToNumber(dayOfWeek);
		return dayNumber === null || date.getDay() === dayNumber;
	}

	private static handleError(context: ITriggerFunctions, message: string, error: unknown): never {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		context.logger.error(`${message}: ${errorMsg}`);
		throw new NodeOperationError(context.getNode(), `${message}: ${errorMsg}`);
	}

	private static getNextSlotHour(now: Date, hourConfigs: HourConfig[]): { hour: number; isTomorrow: boolean } {
		const currentHour = now.getHours();

		// Check remaining slots today
		const todaySlots = hourConfigs
			.filter(hc => TimetableTrigger.matchesDay(now, hc.dayOfWeek) && hc.hour > currentHour)
			.map(hc => hc.hour)
			.sort((a, b) => a - b);

		if (todaySlots.length > 0) {
			return { hour: todaySlots[0], isTomorrow: false };
		}

		// Find next day with available slots
		for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
			const futureDate = new Date(now);
			futureDate.setDate(futureDate.getDate() + daysAhead);

			const futureDaySlots = hourConfigs
				.filter(hc => TimetableTrigger.matchesDay(futureDate, hc.dayOfWeek))
				.map(hc => hc.hour)
				.sort((a, b) => a - b);

			if (futureDaySlots.length > 0) {
				return { hour: futureDaySlots[0], isTomorrow: daysAhead === 1 };
			}
		}

		// Fallback to earliest hour
		if (hourConfigs.length > 0) {
			const allHours = hourConfigs.map(hc => hc.hour).sort((a, b) => a - b);
			return { hour: allHours[0], isTomorrow: true };
		}

		throw new NodeOperationError(null as any, 'No valid time slots configured');
	}

	private static getNextRunTime(now: Date, hourConfigs: HourConfig[]): Date {
		const { hour } = TimetableTrigger.getNextSlotHour(now, hourConfigs);
		const hourConfig = hourConfigs.find(hc => hc.hour === hour)!;

		const minute = hourConfig?.minute === 'random' ? randomInt(0, 60) : (hourConfig?.minute ?? 0);

		// Find next valid date for this hour
		const nextRun = TimetableTrigger.findNextValidDate(now, hour, hourConfigs);
		nextRun.setHours(hour, minute, 0, 0);

		return nextRun;
	}

	private static findNextValidDate(now: Date, targetHour: number, hourConfigs: HourConfig[]): Date {
		const relevantConfigs = hourConfigs.filter(hc => hc.hour === targetHour);

		// Check if we can use today
		for (const config of relevantConfigs) {
			if (TimetableTrigger.matchesDay(now, config.dayOfWeek) && now.getHours() < targetHour) {
				return new Date(now);
			}
		}

		// Check future days
		for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
			const futureDate = new Date(now);
			futureDate.setDate(futureDate.getDate() + daysAhead);

			for (const config of relevantConfigs) {
				if (TimetableTrigger.matchesDay(futureDate, config.dayOfWeek)) {
					return futureDate;
				}
			}
		}

		// Fallback to tomorrow
		const fallback = new Date(now);
		fallback.setDate(fallback.getDate() + 1);
		return fallback;
	}

	private static shouldTriggerNow(currentTime: Date, lastTriggerTime: number | undefined, hourConfigs: HourConfig[]): boolean {
		const currentHour = currentTime.getHours();

		// Check if current hour matches any configured slot
		const hasValidSlot = hourConfigs.some(hc =>
			hc.hour === currentHour && TimetableTrigger.matchesDay(currentTime, hc.dayOfWeek)
		);

		if (!hasValidSlot || !lastTriggerTime) {
			return hasValidSlot;
		}

		// Prevent multiple triggers within the same hour
		const lastTrigger = new Date(lastTriggerTime);
		const timeSinceLastTrigger = currentTime.getTime() - lastTrigger.getTime();
		const oneHourMs = 60 * 60 * 1000;

		return !(timeSinceLastTrigger < oneHourMs && lastTrigger.getHours() === currentHour);
	}

	private static createResultData(momentTz: moment.Moment, timezone: string, hourConfigs: HourConfig[], nextRun: Date, isManual: boolean) {
		const baseData = {
			timestamp: momentTz.toISOString(true),
			'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
			'Readable time': momentTz.format('h:mm:ss a'),
			'Manual execution': isManual,
		};

		if (isManual) {
			return {
				...baseData,
				year: momentTz.year(),
				month: momentTz.month() + 1,
				day: momentTz.date(),
				hour: momentTz.hour(),
				minute: momentTz.minute(),
				second: momentTz.second(),
				dayOfWeek: momentTz.day(),
				weekday: momentTz.format('dddd'),
				timezone: timezone,
			};
		}

		return {
			...baseData,
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
				dayOfWeek: hc.dayOfWeek,
			})),
			'Next scheduled': nextRun.toISOString(),
			'Next scheduled readable': moment.tz(nextRun, timezone).format('MMMM Do YYYY, h:mm:ss a'),
		};
	}

	private static validateTriggerSlots(triggerSlots: TriggerSlots, context: ITriggerFunctions): HourConfig[] {
		if (!triggerSlots?.hours || triggerSlots.hours.length === 0) {
			throw new NodeOperationError(context.getNode(), 'At least one valid hour must be selected', {
				description: 'Please add at least one trigger hour using the dropdown menu',
			});
		}

		for (const hourConfig of triggerSlots.hours) {
			if (typeof hourConfig.hour !== 'number' || hourConfig.hour < 0 || hourConfig.hour > 23) {
				throw new NodeOperationError(context.getNode(), `Invalid hour: ${hourConfig.hour}. Must be between 0 and 23.`);
			}
			if (hourConfig.minute !== 'random' &&
				(typeof hourConfig.minute !== 'number' || hourConfig.minute < 0 || hourConfig.minute > 59)) {
				throw new NodeOperationError(context.getNode(), `Invalid minute: ${hourConfig.minute}. Must be "random" or between 0 and 59.`);
			}
		}

		return triggerSlots.hours.sort((a, b) => a.hour - b.hour);
	}

	// Processing Methods
	private static processManualTrigger(context: ITriggerFunctions) {
		const timezone = context.getTimezone();
		const momentTz = moment.tz(timezone);

		context.logger.info(`✓ MANUAL EXECUTION at ${moment.utc(momentTz.toDate()).format('YYYY-MM-DD HH:mm:ss')} UTC`);
		context.logger.info(`Manual execution in timezone ${timezone}: ${momentTz.format('YYYY-MM-DD HH:mm:ss')}`);

		const resultData = TimetableTrigger.createResultData(momentTz, timezone, [], new Date(), true);
		return [context.helpers.returnJsonArray([resultData])];
	}

	private static processNormalTrigger(context: ITriggerFunctions) {
		const defaultTriggerSlots: TriggerSlots = {
			hours: [{ hour: 12, minute: 'random', dayOfWeek: 'ALL' }],
		};

		let timezone: string;
		let staticData: StaticData;

		try {
			timezone = context.getTimezone();
			staticData = context.getWorkflowStaticData('node') as StaticData;
			if (!staticData.lastTriggerTime) {
				staticData.lastTriggerTime = 0;
			}
		} catch (error) {
			TimetableTrigger.handleError(context, 'Failed to get required data', error);
		}

		const triggerSlots = context.getNodeParameter('triggerSlots', defaultTriggerSlots) as TriggerSlots;
		const hourConfigs = TimetableTrigger.validateTriggerSlots(triggerSlots, context);

		// Log configuration
		try {
			const nextRun = TimetableTrigger.getNextRunTime(moment.tz(timezone).toDate(), hourConfigs);
			context.logger.info(`Configuration loaded at ${new Date().toISOString()}:`);
			context.logger.info(`Timezone: ${timezone}`);
			context.logger.info(`Hour configs: ${JSON.stringify(hourConfigs)}`);
			context.logger.info(`Next scheduled trigger: ${nextRun.toISOString()} (${moment.utc(nextRun).format('YYYY-MM-DD HH:mm:ss')} UTC)`);
		} catch (error) {
			context.logger.error(`Error computing next run time: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}

		return (emitCallback: (data: any) => void) => {
			try {
				const currentTime = moment.tz(timezone).toDate();
				const shouldTrigger = TimetableTrigger.shouldTriggerNow(currentTime, staticData.lastTriggerTime, hourConfigs);

				context.logger.debug(`Trigger check at ${moment.utc(currentTime).format('YYYY-MM-DD HH:mm:ss')} UTC`);
				context.logger.debug(`Should trigger: ${shouldTrigger}`);

				if (!shouldTrigger) {
					try {
						const nextRun = TimetableTrigger.getNextRunTime(currentTime, hourConfigs);
						context.logger.debug(`Not triggering. Next scheduled: ${moment.utc(nextRun).format('YYYY-MM-DD HH:mm:ss')} UTC`);
					} catch (error) {
						context.logger.error(`Error computing next run time: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
					return;
				}

				context.logger.info(`✓ TRIGGERING WORKFLOW at ${moment.utc(currentTime).format('YYYY-MM-DD HH:mm:ss')} UTC`);
				staticData.lastTriggerTime = Date.now();

				try {
					const momentTz = moment.tz(timezone);
					const nextRun = TimetableTrigger.getNextRunTime(momentTz.toDate(), hourConfigs);
					const resultData = TimetableTrigger.createResultData(momentTz, timezone, hourConfigs, nextRun, false);
					emitCallback([context.helpers.returnJsonArray([resultData])]);
				} catch (error) {
					context.logger.error(`Error creating workflow output: ${error instanceof Error ? error.message : 'Unknown error'}`);
					const momentTz = moment.tz(timezone);
					const fallbackData = {
						timestamp: momentTz.toISOString(true),
						'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
						'Readable time': momentTz.format('h:mm:ss a'),
						'Manual execution': false,
						error: 'Failed to compute next run time - workflow executed with fallback data',
					};
					emitCallback([context.helpers.returnJsonArray([fallbackData])]);
				}
			} catch (error) {
				context.logger.error(`Error in execution trigger: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		};
	}

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		try {
			if (this.getMode() === 'manual') {
				const emitData = TimetableTrigger.processManualTrigger(this);
				return {
					manualTriggerFunction: () => {
						this.emit(emitData);
						return Promise.resolve();
					}
				};
			}

			const createTriggerFunction = TimetableTrigger.processNormalTrigger(this);

			this.logger.info('Registering cron job to run every minute for condition checking');
			this.helpers.registerCron('* * * * * *', () => {
				try {
					createTriggerFunction((data: any) => this.emit(data));
				} catch (error) {
					this.logger.error(`Error in execution trigger: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			});

			return {};
		} catch (error) {
			if (error instanceof NodeOperationError) {
				throw error;
			}
			this.logger.error(`Unexpected error in trigger function: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw new NodeOperationError(this.getNode(), `Unexpected error in trigger function: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}