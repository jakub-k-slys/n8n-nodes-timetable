/**
 * Configuration parsing and validation utilities for the Timetable Trigger node
 */

import { NodeOperationError } from 'n8n-workflow';
import { isRight } from 'fp-ts/lib/Either';
import { PathReporter } from 'io-ts/lib/PathReporter';

import type { RawHourConfig } from './SchedulerInterface';
import { RawTriggerHoursDataCodec } from './SchedulerInterface';

/**
 * Parse and validate trigger configuration using io-ts
 * @param triggerHoursData - Raw configuration data from node parameters
 * @param getNode - Function to get the current node for error reporting
 * @returns Validated and sorted hour configurations
 * @throws NodeOperationError if validation fails
 */
export const parseAndValidateConfig = (
	triggerHoursData: unknown,
	getNode: () => any
): RawHourConfig[] => {
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
};