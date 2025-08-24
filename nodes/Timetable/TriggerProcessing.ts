/**
 * Manual and normal trigger processing helpers for the Timetable Trigger node
 */

import moment from 'moment-timezone';
import { NodeOperationError } from 'n8n-workflow';
import type { ITriggerResponse } from 'n8n-workflow';

import { getNextRunTime, createSimpleResultData } from './GenericFunctions';
import { createExecuteTrigger } from './TriggerExecution';

import {
	TimetableConfig,
	RawHourConfig,
	TriggerSlots,
	StaticData,
	NodeHelpers, DefaultTriggerSlots, TriggerSlotsCodec,
} from './SchedulerInterface';
import { isRight } from 'fp-ts/Either';
import { PathReporter } from 'io-ts/PathReporter';

/**
 * Helper function for manual processing mode
 * Handles immediate manual trigger execution without configuration processing
 * @param params - Object containing all required parameters
 * @returns ITriggerResponse with manual trigger function
 */
export const manualProcessing = (getTimezone: () => string, emit: (data: any) => void, helpers: NodeHelpers, logger: any): ITriggerResponse => {
	const timezone = getTimezone();
	const momentTz = moment.tz(timezone);
	
	logger.info(`✓ MANUAL EXECUTION at ${moment.utc(momentTz.toDate()).format('YYYY-MM-DD HH:mm:ss')} UTC`);
	logger.info(`Manual execution in timezone ${timezone}: ${momentTz.format('YYYY-MM-DD HH:mm:ss')}`);
	
	const manualTriggerFunction = () => {
		const resultData = createSimpleResultData(momentTz, timezone);
		emit([helpers.returnJsonArray([resultData])]);
		return Promise.resolve();
	};

	return { manualTriggerFunction };
};

/**
 * Helper function for normal processing mode
 * Handles scheduled trigger registration and configuration processing
 * @param params - Object containing all required parameters
 * @returns ITriggerResponse (empty object for normal mode)
 * @throws NodeOperationError if configuration is invalid or cron registration fails
 */
export const normalProcessing = (getNodeParameter: any, getTimezone: () => string, getWorkflowStaticData: any, getNode: any, emit: (data: any) => void, helpers: NodeHelpers, registerCron: any, logger: any): ITriggerResponse => {
	const triggerSlots = getNodeParameter('triggerSlots', DefaultTriggerSlots) as TriggerSlots;

	const timezone = getTimezone();
	const staticData = getWorkflowStaticData('node') as StaticData;
	const validation = TriggerSlotsCodec.decode(triggerSlots);

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
	let hourConfigs: RawHourConfig[] =  hours.sort((a, b) => a.hour - b.hour);

	const config: TimetableConfig = {
		hourConfigs: hourConfigs.map(item => ({
			hour: item.hour,
			minute: item.minute === 'random' ? undefined : Number(item.minute),
			minuteMode: item.minute === 'random' ? 'random' : 'specific',
			dayOfWeek: item.dayOfWeek as any
		}))
	};

	const logConfigs = config.hourConfigs.map(hc => ({
		hour: hc.hour,
		minute: hc.minute ?? 'random',
		dayOfWeek: hc.dayOfWeek,
		minuteMode: hc.minuteMode
	}));
	
	try {
		const nowForNext = moment.tz(timezone).toDate();
		const nextRun = getNextRunTime(nowForNext, config);
		logger.info(`Configuration loaded at ${new Date().toISOString()}:`);
		logger.info(`Timezone: ${timezone}`);
		logger.info(`Hour configs: ${JSON.stringify(logConfigs)}`);
		logger.info(`Next scheduled trigger: ${nextRun.candidate.toISOString()} (${moment.utc(nextRun.candidate).format('YYYY-MM-DD HH:mm:ss')} UTC)`);
	} catch (error) {
		logger.info(`Configuration loaded at ${new Date().toISOString()}:`);
		logger.info(`Timezone: ${timezone}`);
		logger.info(`Hour configs: ${JSON.stringify(logConfigs)}`);
		logger.error(`Error computing next run time: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}

	const executeTrigger = createExecuteTrigger(config, timezone, staticData, hourConfigs, emit, helpers, logger);

	try {
		logger.info('Registering cron job to run every minute for condition checking');
		registerCron('* * * * * *' as any, executeTrigger);
	} catch (error) {
		throw new NodeOperationError(
			getNode(),
			`Failed to create schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
	return {};
}