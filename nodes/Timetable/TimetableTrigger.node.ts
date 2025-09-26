import type {
	ITriggerFunctions,
	INodeType,
	INodeTypeDescription,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError, randomInt } from 'n8n-workflow';
import moment from 'moment-timezone';

// Types and Interfaces
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

interface NextSlotResult {
	hour: number;
	isTomorrow: boolean;
}

interface NextRunTime {
	date: Date;
	candidate: Date;
}

interface HourOption {
	name: string;
	value: number;
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
								options: this.generateHourOptions()
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

	// Utility Functions
	private generateHourOptions(): HourOption[] {
		return Array.from({ length: 24 }, (_, i) => ({
			name: i === 0 ? '00:00 (Midnight)' :
				  i === 12 ? '12:00 (Noon)' :
				  `${i.toString().padStart(2, '0')}:00`,
			value: i
		}));
	}

	private dayStringToNumber(day: DayOfWeek): number | null {
		switch (day) {
			case 'SUN': return 0;
			case 'MON': return 1;
			case 'TUE': return 2;
			case 'WED': return 3;
			case 'THU': return 4;
			case 'FRI': return 5;
			case 'SAT': return 6;
			case 'ALL': return null;
			default: return null;
		}
	}

	private matchesDay(date: Date, dayOfWeek?: DayOfWeek): boolean {
		if (!dayOfWeek || dayOfWeek === 'ALL') {
			return true;
		}
		const dayNumber = this.dayStringToNumber(dayOfWeek);
		return dayNumber !== null && date.getDay() === dayNumber;
	}

	private getNextSlotHour(now: Date, hourConfigs: HourConfig[]): NextSlotResult {
		const currentHour = now.getHours();
		const todaySlots = hourConfigs
			.filter(hc => this.matchesDay(now, hc.dayOfWeek))
			.map(hc => hc.hour)
			.sort((a, b) => a - b);

		for (const hour of todaySlots) {
			if (currentHour < hour) {
				return { hour, isTomorrow: false };
			}
		}

		for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
			const futureDate = new Date(now);
			futureDate.setDate(futureDate.getDate() + daysAhead);

			const futureDaySlots = hourConfigs
				.filter(hc => this.matchesDay(futureDate, hc.dayOfWeek))
				.map(hc => hc.hour)
				.sort((a, b) => a - b);

			if (futureDaySlots.length > 0) {
				return {
					hour: futureDaySlots[0],
					isTomorrow: daysAhead === 1
				};
			}
		}

		if (hourConfigs.length > 0) {
			const allHours = hourConfigs.map(hc => hc.hour).sort((a, b) => a - b);
			return { hour: allHours[0], isTomorrow: true };
		}

		throw new NodeOperationError(null as any, 'No valid time slots configured');
	}

	private findNextValidDate(now: Date, targetHour: number, hourConfigs: HourConfig[]): Date {
		const relevantConfigs = hourConfigs.filter(hc => hc.hour === targetHour);

		for (const config of relevantConfigs) {
			if (this.matchesDay(now, config.dayOfWeek) && now.getHours() < targetHour) {
				return new Date(now);
			}
		}

		for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
			const futureDate = new Date(now);
			futureDate.setDate(futureDate.getDate() + daysAhead);

			for (const config of relevantConfigs) {
				if (this.matchesDay(futureDate, config.dayOfWeek)) {
					return futureDate;
				}
			}
		}

		const fallback = new Date(now);
		fallback.setDate(fallback.getDate() + 1);
		return fallback;
	}

	private getNextRunTime(now: Date, hourConfigs: HourConfig[]): NextRunTime {
		const { hour } = this.getNextSlotHour(now, hourConfigs);

		const hourConfig = hourConfigs.find(hc => hc.hour === hour)!;
		let minute: number;
		if (hourConfig?.minute === 'random') {
			minute = randomInt(0, 60);
		} else {
			minute = hourConfig?.minute ?? 0;
		}

		const nextRun = this.findNextValidDate(now, hour, hourConfigs);
		nextRun.setHours(hour, minute, 0, 0);

		return {
			date: now,
			candidate: nextRun
		};
	}

	private shouldTriggerAtTime(
		currentTime: Date,
		lastTriggerTime: number | undefined,
		hourConfigs: HourConfig[]
	): boolean {
		const currentHour = currentTime.getHours();

		const matchingConfigs = hourConfigs.filter(hc =>
			hc.hour === currentHour && this.matchesDay(currentTime, hc.dayOfWeek)
		);

		const hasValidSlot = matchingConfigs.length > 0;

		if (!hasValidSlot) {
			return false;
		}

		if (!lastTriggerTime) {
			return true;
		}

		const lastTrigger = new Date(lastTriggerTime);
		const timeSinceLastTrigger = currentTime.getTime() - lastTrigger.getTime();

		const oneHourMs = 60 * 60 * 1000;
		if (timeSinceLastTrigger < oneHourMs && lastTrigger.getHours() === currentHour) {
			return false;
		}

		return true;
	}

	private shouldTriggerNow(
		lastTriggerTime: number | undefined,
		config: HourConfig[],
		timezone: string
	): boolean {
		const now = moment.tz(timezone).toDate();
		return this.shouldTriggerAtTime(now, lastTriggerTime, config);
	}

	private createResultData(
		momentTz: moment.Moment,
		timezone: string,
		hourConfigs: HourConfig[],
		nextRun: NextRunTime,
		isManual: boolean
	) {
		return {
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
			'Manual execution': isManual
		};
	}

	private createSimpleResultData(
		momentTz: moment.Moment,
		timezone: string
	) {
		return {
			timestamp: momentTz.toISOString(true),
			'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
			'Readable time': momentTz.format('h:mm:ss a'),
			'Manual execution': true,
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

	// Processing Methods
	private manualProcessing(context: ITriggerFunctions) {
		const timezone = context.getTimezone();
		const momentTz = moment.tz(timezone);

		context.logger.info(`✓ MANUAL EXECUTION at ${moment.utc(momentTz.toDate()).format('YYYY-MM-DD HH:mm:ss')} UTC`);
		context.logger.info(`Manual execution in timezone ${timezone}: ${momentTz.format('YYYY-MM-DD HH:mm:ss')}`);

		const resultData = this.createSimpleResultData(momentTz, timezone);
		const emitData = [context.helpers.returnJsonArray([resultData])];

		return { emitData };
	}

	private normalProcessing(context: ITriggerFunctions) {
		const defaultTriggerSlots: TriggerSlots = {
			hours: [
				{ hour: 12, minute: 'random', dayOfWeek: 'ALL' }
			]
		};

		const triggerSlots = context.getNodeParameter('triggerSlots', defaultTriggerSlots) as TriggerSlots;

		let timezone: string;
		try {
			timezone = context.getTimezone();
		} catch (error) {
			context.logger.error(`Error in normal processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw new NodeOperationError(
				context.getNode(),
				`Failed to get timezone: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}

		let staticData: StaticData;
		try {
			staticData = context.getWorkflowStaticData('node') as StaticData;
			if (!staticData.lastTriggerTime) {
				staticData.lastTriggerTime = 0;
			}
		} catch (error) {
			context.logger.error(`Error in normal processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw new NodeOperationError(
				context.getNode(),
				`Failed to get workflow static data: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}

		if (!triggerSlots?.hours || triggerSlots.hours.length === 0) {
			throw new NodeOperationError(
				context.getNode(),
				'At least one valid hour must be selected',
				{
					description: 'Please add at least one trigger hour using the dropdown menu'
				}
			);
		}

		// Basic validation
		for (const hourConfig of triggerSlots.hours) {
			if (typeof hourConfig.hour !== 'number' || hourConfig.hour < 0 || hourConfig.hour > 23) {
				throw new NodeOperationError(
					context.getNode(),
					`Invalid hour: ${hourConfig.hour}. Must be between 0 and 23.`
				);
			}
			if (hourConfig.minute !== 'random' && (typeof hourConfig.minute !== 'number' || hourConfig.minute < 0 || hourConfig.minute > 59)) {
				throw new NodeOperationError(
					context.getNode(),
					`Invalid minute: ${hourConfig.minute}. Must be "random" or between 0 and 59.`
				);
			}
		}

		const hourConfigs: HourConfig[] = triggerSlots.hours.sort((a, b) => a.hour - b.hour);

		try {
			const nowForNext = moment.tz(timezone).toDate();
			const nextRun = this.getNextRunTime(nowForNext, hourConfigs);
			context.logger.info(`Configuration loaded at ${new Date().toISOString()}:`);
			context.logger.info(`Timezone: ${timezone}`);
			context.logger.info(`Hour configs: ${JSON.stringify(hourConfigs)}`);
			context.logger.info(`Next scheduled trigger: ${nextRun.candidate.toISOString()} (${moment.utc(nextRun.candidate).format('YYYY-MM-DD HH:mm:ss')} UTC)`);
		} catch (error) {
			context.logger.info(`Configuration loaded at ${new Date().toISOString()}:`);
			context.logger.info(`Timezone: ${timezone}`);
			context.logger.info(`Hour configs: ${JSON.stringify(hourConfigs)}`);
			context.logger.error(`Error computing next run time: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}

		const createTriggerFunction = (emitCallback: (data: any) => void) => {
			try {
				const currentTime = moment.tz(timezone).toDate();
				const shouldTrigger = this.shouldTriggerNow(staticData.lastTriggerTime, hourConfigs, timezone);

				const currentTimeUtc = moment.utc(currentTime);
				context.logger.debug(`Trigger check at ${currentTimeUtc.format('YYYY-MM-DD HH:mm:ss')} UTC (${currentTime.toISOString()})`);
				context.logger.debug(`Current time in timezone ${timezone}: ${moment.tz(timezone).format('YYYY-MM-DD HH:mm:ss')}`);
				context.logger.debug(`Last trigger time: ${staticData.lastTriggerTime ? new Date(staticData.lastTriggerTime).toISOString() : 'never'}`);
				context.logger.debug(`Should trigger: ${shouldTrigger}`);

				if (!shouldTrigger) {
					try {
						const nextRun = this.getNextRunTime(currentTime, hourConfigs);
						context.logger.debug(`Not triggering. Next scheduled: ${moment.utc(nextRun.candidate).format('YYYY-MM-DD HH:mm:ss')} UTC`);
					} catch (error) {
						context.logger.error(`Error computing next run time for skip: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
					return;
				}

				context.logger.info(`✓ TRIGGERING WORKFLOW at ${moment.utc(currentTime).format('YYYY-MM-DD HH:mm:ss')} UTC`);
				staticData.lastTriggerTime = Date.now();

				try {
					const momentTz = moment.tz(timezone);
					const nextRun = this.getNextRunTime(momentTz.toDate(), hourConfigs);
					const resultData = this.createResultData(momentTz, timezone, hourConfigs, nextRun, false);
					emitCallback([context.helpers.returnJsonArray([resultData])]);
				} catch (error) {
					context.logger.error(`Error creating workflow output: ${error instanceof Error ? error.message : 'Unknown error'}`);
					const momentTz = moment.tz(timezone);
					const fallbackData = {
						timestamp: momentTz.toISOString(true),
						'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
						'Readable time': momentTz.format('h:mm:ss a'),
						'Manual execution': false,
						error: 'Failed to compute next run time - workflow executed with fallback data'
					};
					emitCallback([context.helpers.returnJsonArray([fallbackData])]);
				}
			} catch (error) {
				context.logger.error(`Error in execution trigger: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		};

		return { createTriggerFunction };
	}

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		try {
			if (this.getMode() === 'manual') {
				try {
					const timetableTrigger = new TimetableTrigger();
					const { emitData } = timetableTrigger.manualProcessing(this);
					const manualTriggerFunction = () => {
						this.emit(emitData);
						return Promise.resolve();
					};
					return { manualTriggerFunction };
				} catch (error) {
					this.logger.error(`Error in normal processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
					throw new NodeOperationError(
						this.getNode(),
						`Failed to process manual trigger: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}
			}

			let createTriggerFunction;
			try {
				const timetableTrigger = new TimetableTrigger();
				const result = timetableTrigger.normalProcessing(this);
				createTriggerFunction = result.createTriggerFunction;
			} catch (error) {
				this.logger.error(`Error in normal processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
				throw error;
			}

			let executeTrigger;
			try {
				executeTrigger = () => createTriggerFunction((data: any) => this.emit(data));
			} catch (error) {
				this.logger.error(`Failed to create trigger function: ${error instanceof Error ? error.message : 'Unknown error'}`);
				throw new NodeOperationError(
					this.getNode(),
					`Failed to create trigger function: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}

			try {
				this.logger.info('Registering cron job to run every minute for condition checking');
				this.helpers.registerCron('* * * * * *', () => {
					try {
						executeTrigger();
					} catch (error) {
						this.logger.error(`Error in execution trigger: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
				});
			} catch (error) {
				this.logger.error(`Failed to register cron job: ${error instanceof Error ? error.message : 'Unknown error'}`);
				throw new NodeOperationError(
					this.getNode(),
					`Failed to register cron schedule: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
			return {};
		} catch (error) {
			if (error instanceof NodeOperationError) {
				throw error;
			}
			this.logger.error(`Unexpected error in trigger function: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw new NodeOperationError(
				this.getNode(),
				`Unexpected error in trigger function: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}
}