import * as t from 'io-ts';

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

export type DayOfWeek = t.TypeOf<typeof DayOfWeekCodec>;

export const HourCodec = t.refinement(
	t.number,
	(n): n is number => Number.isInteger(n) && n >= 0 && n <= 23,
	'Hour'
);

export type Hour = t.TypeOf<typeof HourCodec>;

export const MinuteCodec = t.refinement(
	t.union([t.literal('random'), t.number]),
	(n): n is number | 'random' => {
		if (n === 'random') return true;
		return n >= 0 && n <= 59;
	},
	'Minute'
);

export type Minute = t.TypeOf<typeof MinuteCodec>;

export const HourConfigCodec = t.type({
	hour: HourCodec,
	minute: MinuteCodec,
	dayOfWeek: t.union([t.undefined, DayOfWeekCodec])
});

export const TriggerSlotsCodec = t.type({
	hours: t.array(HourConfigCodec)
});

export type HourConfig = t.TypeOf<typeof HourConfigCodec>;
export type TriggerSlots = t.TypeOf<typeof TriggerSlotsCodec>;

export const DefaultTriggerSlots: TriggerSlots = {
	hours: [
		{ hour: 12, minute: 'random', dayOfWeek: 'ALL' }
	]
}

export interface StaticData {
	lastTriggerTime?: number;
}

export interface NodeHelpers {
	returnJsonArray: (data: any[]) => any;
}

export interface NextSlotResult {
	hour: number;
	isTomorrow: boolean;
}

export interface NextRunTime {
	date: Date;
	candidate: Date;
}