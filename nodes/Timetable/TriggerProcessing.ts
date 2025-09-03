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
	const timetableLogger = createTimetableLogger(context.logger);
	
	try {
		const triggerSlots = context.getNodeParameter('triggerSlots', DefaultTriggerSlots) as TriggerSlots;

		let timezone: string;
		try {
			timezone = context.getTimezone();
		} catch (error) {
			timetableLogger.logNormalProcessingError(error);
			throw new NodeOperationError(
				context.getNode(),
				`Failed to get timezone: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}

		let staticData: { lastTriggerTime: number };
		try {
			staticData = context.getWorkflowStaticData('node') as {
				lastTriggerTime: number;
			};
			if (!staticData.lastTriggerTime) {
				staticData.lastTriggerTime = 0;
			}
		} catch (error) {
			timetableLogger.logNormalProcessingError(error);
			throw new NodeOperationError(
				context.getNode(),
				`Failed to get workflow static data: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}

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

		let createTriggerFunction;
		try {
			createTriggerFunction = createExecuteTrigger(hourConfigs, timezone, staticData, context.helpers, context.logger);
		} catch (error) {
			timetableLogger.logNormalProcessingError(error);
			throw new NodeOperationError(
				context.getNode(),
				`Failed to create trigger function: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}

		return { createTriggerFunction };
	} catch (error) {
		if (error instanceof NodeOperationError) {
			throw error;
		}
		timetableLogger.logNormalProcessingError(error);
		throw new NodeOperationError(
			context.getNode(),
			`Unexpected error in normal processing: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}
