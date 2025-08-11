import moment from 'moment-timezone';
import { randomInt } from 'n8n-workflow';

import type { TimetableConfig, NextSlotResult, NextRunTime } from './SchedulerInterface';

export function getNextSlotHour(now: Date, fixedHours: number[]): NextSlotResult {
	const currentHour = now.getHours();
	
	for (const hour of fixedHours) {
		if (currentHour < hour) {
			return { hour, isTomorrow: false };
		}
	}

	// All slots for today have passed, return first slot for tomorrow
	return { hour: fixedHours[0], isTomorrow: true };
}

export function getNextRunTime(now: Date, config: TimetableConfig): NextRunTime {
	const { hour, isTomorrow } = getNextSlotHour(now, config.fixedHours);
	
	let minute = 0;
	if (config.randomizeMinutes) {
		const minMinute = config.minMinute ?? 0;
		const maxMinute = config.maxMinute ?? 59;
		minute = randomInt(minMinute, maxMinute + 1);
	}

	const nextRun = new Date(now);
	if (isTomorrow) {
		nextRun.setDate(nextRun.getDate() + 1);
	}

	nextRun.setHours(hour, minute, 0, 0);
	
	return {
		date: now,
		candidate: nextRun
	};
}

export function shouldTriggerAtTime(
	currentTime: Date,
	lastTriggerTime: number | undefined,
	config: TimetableConfig
): boolean {
	const currentHour = currentTime.getHours();
	
	// Check if current hour is one of our fixed hours
	if (!config.fixedHours.includes(currentHour)) {
		return false;
	}

	// If no previous trigger, allow this one
	if (!lastTriggerTime) {
		return true;
	}

	const lastTrigger = new Date(lastTriggerTime);
	const timeSinceLastTrigger = currentTime.getTime() - lastTrigger.getTime();
	
	// Prevent multiple triggers within the same hour
	const oneHourMs = 60 * 60 * 1000;
	if (timeSinceLastTrigger < oneHourMs && lastTrigger.getHours() === currentHour) {
		return false;
	}

	return true;
}

export function shouldTriggerNow(
	lastTriggerTime: number | undefined,
	config: TimetableConfig,
	timezone: string
): boolean {
	const now = moment.tz(timezone).toDate();
	return shouldTriggerAtTime(now, lastTriggerTime, config);
}

export function toCronExpression(config: TimetableConfig) {
	// Create a cron expression that triggers every minute during fixed hours
	// We'll use shouldTriggerNow() to filter out unwanted triggers
	const hoursExpression = config.fixedHours.join(',');
	return `0 * ${hoursExpression} * * *` as any; // Type assertion for n8n cron expression
}
