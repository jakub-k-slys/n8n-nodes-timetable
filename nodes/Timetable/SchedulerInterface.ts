export interface TimetableConfig {
	fixedHours: number[];
	randomizeMinutes: boolean;
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
