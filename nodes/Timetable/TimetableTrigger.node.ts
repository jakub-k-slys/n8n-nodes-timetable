import moment from 'moment-timezone';
import type {
	ITriggerFunctions,
	INodeType,
	INodeTypeDescription,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

import { shouldTriggerNow, toCronExpression, getNextRunTime } from './GenericFunctions';
import type { TimetableConfig } from './SchedulerInterface';

export class TimetableTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Timetable Trigger',
		name: 'timetableTrigger',
		icon: 'fa:clock',
		group: ['trigger', 'schedule'],
		version: [1, 1.1, 1.2],
		description: 'Triggers the workflow at fixed time slots with optional randomization',
		eventTriggerDescription: '',
		activationMessage:
			'Your timetable trigger will now trigger executions at the time slots you have defined.',
		defaults: {
			name: 'Timetable Trigger',
			color: '#31C49F',
		},

		inputs: [],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName:
					'This workflow will run at the time slots you define here once you <a data-key="activate">activate</a> it.<br><br>For testing, you can also trigger it manually: by going back to the canvas and clicking \'execute workflow\'',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Fixed Time Slots',
				name: 'fixedHours',
				type: 'string',
				default: '12,16,21',
				placeholder: '12,16,21',
				description: 'Comma-separated list of hours (0-23) when the workflow should trigger',
				hint: 'Example: 12,16,21 for 12pm, 4pm, and 9pm',
			},
			{
				displayName: 'Randomize Minutes',
				name: 'randomizeMinutes',
				type: 'boolean',
				default: true,
				description: 'Whether to randomize the minute within each hour',
			},
			{
				displayName: 'Minimum Minute',
				name: 'minMinute',
				type: 'number',
				default: 0,
				typeOptions: {
					minValue: 0,
					maxValue: 59,
				},
				displayOptions: {
					show: {
						randomizeMinutes: [true],
					},
				},
				description: 'Minimum minute for randomization (0-59)',
			},
			{
				displayName: 'Maximum Minute',
				name: 'maxMinute',
				type: 'number',
				default: 59,
				typeOptions: {
					minValue: 0,
					maxValue: 59,
				},
				displayOptions: {
					show: {
						randomizeMinutes: [true],
					},
				},
				description: 'Maximum minute for randomization (0-59)',
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const fixedHoursString = this.getNodeParameter('fixedHours', '12,16,21') as string;
		const randomizeMinutes = this.getNodeParameter('randomizeMinutes', true) as boolean;
		const minMinute = this.getNodeParameter('minMinute', 0) as number;
		const maxMinute = this.getNodeParameter('maxMinute', 59) as number;
		
		const timezone = this.getTimezone();
		const staticData = this.getWorkflowStaticData('node') as {
			lastTriggerTime?: number;
		};

		// Parse and validate fixed hours
		let fixedHours: number[];
		try {
			fixedHours = fixedHoursString
				.split(',')
				.map(h => parseInt(h.trim(), 10))
				.filter(h => h >= 0 && h <= 23)
				.sort((a, b) => a - b);
				
			if (fixedHours.length === 0) {
				throw new NodeOperationError(
					this.getNode(),
					'At least one valid hour (0-23) must be specified'
				);
			}
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				`Invalid fixed hours format: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{
					description: 'Please provide comma-separated hours (0-23), e.g., "12,16,21"',
				}
			);
		}

		// Validate minute range
		if (randomizeMinutes && minMinute > maxMinute) {
			throw new NodeOperationError(
				this.getNode(),
				'Minimum minute cannot be greater than maximum minute',
			);
		}

		const config: TimetableConfig = {
			fixedHours,
			randomizeMinutes,
			minMinute: randomizeMinutes ? minMinute : undefined,
			maxMinute: randomizeMinutes ? maxMinute : undefined,
		};

		const executeTrigger = () => {
			const shouldTrigger = shouldTriggerNow(staticData.lastTriggerTime, config, timezone);
			if (!shouldTrigger) return;

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
				'Fixed hours': fixedHours,
				'Next scheduled': nextRun.candidate.toISOString(),
				'Randomize minutes': randomizeMinutes,
			};

			this.emit([this.helpers.returnJsonArray([resultData])]);
		};

		if (this.getMode() !== 'manual') {
			try {
				const cronExpression = toCronExpression(config);
				this.helpers.registerCron(cronExpression, () => executeTrigger());
			} catch (error) {
				throw new NodeOperationError(
					this.getNode(),
					`Failed to create schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
				);
			}
			return {};
		} else {
			const manualTriggerFunction = async () => {
				executeTrigger();
			};

			return { manualTriggerFunction };
		}
	}
}