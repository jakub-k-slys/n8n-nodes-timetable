export type DayOfWeek = 'ALL' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface HourConfig {
	hour: number;
	minuteMode: 'random' | 'specific';
	minute?: number; // Only used when minuteMode is 'specific'
	dayOfWeek?: DayOfWeek; // Optional for backward compatibility
}

export interface TimetableConfig {
	hourConfigs: HourConfig[];
	// Legacy fields for backward compatibility
	fixedHours?: number[];
	randomizeMinutes?: boolean;
	minMinute?: number;
	maxMinute?: number;
}

export interface NextSlotResult {
	hour: number;
	isTomorrow: boolean;
}

export interface NextRunTime {
	date: Date;
	candidate: Date;
}
