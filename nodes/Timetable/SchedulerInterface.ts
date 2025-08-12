export interface HourConfig {
	hour: number;
	minuteMode: 'random' | 'specific';
	minute?: number;
	minMinute?: number;
	maxMinute?: number;
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
