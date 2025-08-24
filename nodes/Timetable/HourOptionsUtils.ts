/**
 * Utility functions for generating hour options for the Timetable Trigger node
 */

export interface HourOption {
	name: string;
	value: number;
}

/**
 * Generate hour options dynamically for the trigger configuration dropdown
 * @returns Array of hour options with formatted names and numeric values
 */
export function generateHourOptions(): HourOption[] {
	return Array.from({ length: 24 }, (_, i) => ({
		name: i === 0 ? '00:00 (Midnight)' : 
			  i === 12 ? '12:00 (Noon)' : 
			  `${i.toString().padStart(2, '0')}:00`,
		value: i
	}));
}