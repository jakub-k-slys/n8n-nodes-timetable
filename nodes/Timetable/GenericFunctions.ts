import moment from 'moment-timezone';
import { randomInt } from 'n8n-workflow';

import type { NextSlotResult, NextRunTime, DayOfWeek, HourConfig } from './SchedulerInterface';

const dayStringToNumber = (day: DayOfWeek): number | null => {
	switch (day) {
		case 'SUN': return 0;
		case 'MON': return 1;
		case 'TUE': return 2;
		case 'WED': return 3;
		case 'THU': return 4;
		case 'FRI': return 5;
		case 'SAT': return 6;
		case 'ALL': return null;
		default: return null;
	}
};

const matchesDay = (date: Date, dayOfWeek?: DayOfWeek): boolean => {
	if (!dayOfWeek || dayOfWeek === 'ALL') {
		return true;
	}
	const dayNumber = dayStringToNumber(dayOfWeek);
	return dayNumber !== null && date.getDay() === dayNumber;
};

export const getNextSlotHour = (now: Date, hourConfigs: HourConfig[]): NextSlotResult => {
	const currentHour = now.getHours();
	const todaySlots = hourConfigs
		.filter(hc => matchesDay(now, hc.dayOfWeek))
		.map(hc => hc.hour)
		.sort((a, b) => a - b);
	
	for (const hour of todaySlots) {
		if (currentHour < hour) {
			return { hour, isTomorrow: false };
		}
	}
	
	for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
		const futureDate = new Date(now);
		futureDate.setDate(futureDate.getDate() + daysAhead);
		
		const futureDaySlots = hourConfigs
			.filter(hc => matchesDay(futureDate, hc.dayOfWeek))
			.map(hc => hc.hour)
			.sort((a, b) => a - b);
		
		if (futureDaySlots.length > 0) {
			return { 
				hour: futureDaySlots[0], 
				isTomorrow: daysAhead === 1 
			};
		}
	}
	
	if (hourConfigs.length > 0) {
		const allHours = hourConfigs.map(hc => hc.hour).sort((a, b) => a - b);
		return { hour: allHours[0], isTomorrow: true };
	}
	
	throw new Error('No valid time slots configured');
}

export const getNextRunTime = (now: Date, hourConfigs: HourConfig[]): NextRunTime => {
	const { hour } = getNextSlotHour(now, hourConfigs);

	const hourConfig = hourConfigs.find(hc => hc.hour === hour)!;
	let minute: number;
	if (hourConfig?.minute === 'random') {
		minute = randomInt(0, 60);
	} else {
		minute = hourConfig?.minute ?? 0;
	}

	const nextRun = findNextValidDate(now, hour, hourConfigs);
	nextRun.setHours(hour, minute, 0, 0);
	
	return {
		date: now,
		candidate: nextRun
	};
}

const findNextValidDate = (now: Date, targetHour: number, hourConfigs: HourConfig[]): Date => {
	const relevantConfigs = hourConfigs.filter(hc => hc.hour === targetHour);
	
	for (const config of relevantConfigs) {
		if (matchesDay(now, config.dayOfWeek) && now.getHours() < targetHour) {
			return new Date(now);
		}
	}
	
	for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
		const futureDate = new Date(now);
		futureDate.setDate(futureDate.getDate() + daysAhead);
		
		for (const config of relevantConfigs) {
			if (matchesDay(futureDate, config.dayOfWeek)) {
				return futureDate;
			}
		}
	}
	
	const fallback = new Date(now);
	fallback.setDate(fallback.getDate() + 1);
	return fallback;
}

export const shouldTriggerAtTime = (
	currentTime: Date,
	lastTriggerTime: number | undefined,
	hourConfigs: HourConfig[]
): boolean => {
	const currentHour = currentTime.getHours();
	
	const matchingConfigs = hourConfigs.filter(hc => 
		hc.hour === currentHour && matchesDay(currentTime, hc.dayOfWeek)
	);
	
	const hasValidSlot = matchingConfigs.length > 0;
		
	if (!hasValidSlot) {
		return false;
	}

	if (!lastTriggerTime) {
		return true;
	}

	const lastTrigger = new Date(lastTriggerTime);
	const timeSinceLastTrigger = currentTime.getTime() - lastTrigger.getTime();
	
	const oneHourMs = 60 * 60 * 1000;
	if (timeSinceLastTrigger < oneHourMs && lastTrigger.getHours() === currentHour) {
		return false;
	}

	return true;
}

export const shouldTriggerNow = (
	lastTriggerTime: number | undefined,
	config: HourConfig[],
	timezone: string
): boolean => {
	const now = moment.tz(timezone).toDate();
	return shouldTriggerAtTime(now, lastTriggerTime, config);
};

export const createResultData = (
	momentTz: moment.Moment,
	timezone: string,
	hourConfigs: HourConfig[],
	nextRun: NextRunTime,
	isManual: boolean
) => {
	return {
		timestamp: momentTz.toISOString(true),
		'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
		'Readable time': momentTz.format('h:mm:ss a'),
		'Day of week': momentTz.format('dddd'),
		Year: momentTz.format('YYYY'),
		Month: momentTz.format('MMMM'),
		'Day of month': momentTz.format('DD'),
		Hour: momentTz.format('HH'),
		Minute: momentTz.format('mm'),
		Second: momentTz.format('ss'),
		Timezone: `${timezone} (UTC${momentTz.format('Z')})`,
		'Trigger hours': hourConfigs.map(hc => ({
			hour: hc.hour,
			minute: hc.minute,
			dayOfWeek: hc.dayOfWeek
		})),
		'Next scheduled': nextRun.candidate.toISOString(),
		'Next scheduled readable': moment.tz(nextRun.candidate, timezone).format('MMMM Do YYYY, h:mm:ss a'),
		'Manual execution': isManual
	};
}

export const createSimpleResultData = (
	momentTz: moment.Moment,
	timezone: string
) => {
	return {
		timestamp: momentTz.toISOString(true),
		'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
		'Readable time': momentTz.format('h:mm:ss a'),
		'Manual execution': true,
		year: momentTz.year(),
		month: momentTz.month() + 1,
		day: momentTz.date(),
		hour: momentTz.hour(),
		minute: momentTz.minute(),
		second: momentTz.second(),
		dayOfWeek: momentTz.day(),
		weekday: momentTz.format('dddd'),
		timezone: timezone,
	};
}