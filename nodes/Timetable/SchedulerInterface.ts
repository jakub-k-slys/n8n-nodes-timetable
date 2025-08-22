import * as t from 'io-ts';

export type DayOfWeek = 'ALL' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

// Raw configuration types (from user input)
export interface RawHourConfig {
	hour: number;
	minute: string; // 'random' or '0'-'59'
	dayOfWeek?: string;
}

export interface RawTriggerHoursData {
	hours: Array<RawHourConfig>;
}

// Processed configuration types (internal use)
export interface HourConfig {
	hour: number;
	minuteMode: 'random' | 'specific';
	minute?: number; // Only used when minuteMode is 'specific'
	dayOfWeek?: DayOfWeek; // Optional for backward compatibility
}

// Function parameter types
export interface StaticData {
	lastTriggerTime?: number;
}

export interface EmitFunction {
	(data: any): void;
}

export interface NodeHelpers {
	returnJsonArray: (data: any[]) => any;
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

// io-ts codecs for runtime validation
export const DayOfWeekCodec = t.union([
	t.literal('ALL'),
	t.literal('MON'),
	t.literal('TUE'),
	t.literal('WED'),
	t.literal('THU'),
	t.literal('FRI'),
	t.literal('SAT'),
	t.literal('SUN')
]);

// Custom codec for valid hour (0-23)
export const ValidHourCodec = t.refinement(
	t.number,
	(n): n is number => Number.isInteger(n) && n >= 0 && n <= 23,
	'ValidHour'
);

// Custom codec for valid minute string ('random' or '0'-'59')
export const ValidMinuteCodec = t.refinement(
	t.string,
	(s): s is string => {
		if (s === 'random') return true;
		const n = parseInt(s, 10);
		return !isNaN(n) && n >= 0 && n <= 59 && n.toString() === s;
	},
	'ValidMinute'
);

export const RawHourConfigCodec = t.type({
	hour: ValidHourCodec,
	minute: ValidMinuteCodec,
	dayOfWeek: t.union([t.undefined, DayOfWeekCodec])
});

export const RawTriggerHoursDataCodec = t.type({
	hours: t.array(RawHourConfigCodec)
});

// Type extraction from codecs
export type RawHourConfigFromCodec = t.TypeOf<typeof RawHourConfigCodec>;
export type RawTriggerHoursDataFromCodec = t.TypeOf<typeof RawTriggerHoursDataCodec>;
