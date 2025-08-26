/**
 * Manual and normal trigger processing helpers for the Timetable Trigger node
 */

import moment from 'moment-timezone';
import { NodeOperationError } from 'n8n-workflow';
import { getNextRunTime, createSimpleResultData } from './GenericFunctions';
import { createExecuteTrigger } from './TriggerExecution';
import { createTimetableLogger } from './LoggingHelpers';
import {
	HourConfig,
	TriggerSlots,
	StaticData,
	DefaultTriggerSlots, TriggerSlotsCodec,
} from './SchedulerInterface';
import { isRight } from 'fp-ts/Either';
import { PathReporter } from 'io-ts/PathReporter';

/**
 * Helper function for manual processing mode
 * Handles immediate manual trigger execution without configuration processing
 * @param params - Object containing all required parameters
 * @returns ITriggerResponse with manual trigger function
 */
export const manualProcessing = (context: any) => {
	const timezone = context.getTimezone();
	const momentTz = moment.tz(timezone);
	const timetableLogger = createTimetableLogger(context.logger);
	
	timetableLogger.logManualExecution(timezone, momentTz);
	
	const resultData = createSimpleResultData(momentTz, timezone);
	const emitData = [context.helpers.returnJsonArray([resultData])];

	return { emitData };
};

/**
 * Helper function for normal processing mode
 * Handles scheduled trigger registration and configuration processing
 * @param params - Object containing all required parameters
 * @returns ITriggerResponse (empty object for normal mode)
 * @throws NodeOperationError if configuration is invalid or cron registration fails
 */
export const normalProcessing = (context: any) => {
	const triggerSlots = context.getNodeParameter('triggerSlots', DefaultTriggerSlots) as TriggerSlots;
	const timetableLogger = createTimetableLogger(context.logger);

	const timezone = context.getTimezone();
	const staticData = context.getWorkflowStaticData('node') as StaticData;
	const validation = TriggerSlotsCodec.decode(triggerSlots);

	if (!isRight(validation)) {
		const errors = PathReporter.report(validation).join('; ');
		throw new NodeOperationError(
			context.getNode(),
			`Invalid trigger configuration: ${errors}`,
			{
				description: 'Please check your hour selections, minute values (must be "random" or 0-59), and day of week settings'
			}
		);
	}

	const { hours } = validation.right;

	if (hours.length === 0) {
		throw new NodeOperationError(
			context.getNode(),
			'At least one valid hour must be selected',
			{
				description: 'Please add at least one trigger hour using the dropdown menu'
			}
		);
	}

	// Sort by hour for consistent ordering
	let hourConfigs: HourConfig[] =  hours.sort((a, b) => a.hour - b.hour);
	
	try {
		const nowForNext = moment.tz(timezone).toDate();
		const nextRun = getNextRunTime(nowForNext, hourConfigs);
		timetableLogger.logConfigurationLoaded(timezone, hourConfigs, nextRun);
	} catch (error) {
		timetableLogger.logConfigurationError(timezone, hourConfigs, error);
	}

	const createTriggerFunction = createExecuteTrigger(hourConfigs, timezone, staticData, context.helpers, context.logger);

	return { createTriggerFunction, registerCron: context.helpers.registerCron, logger: context.logger };
}