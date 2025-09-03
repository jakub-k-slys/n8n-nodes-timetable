/**
 * Logging helpers for the Timetable Trigger node
 */

import moment from 'moment-timezone';
import type { HourConfig, NextRunTime } from './SchedulerInterface';

export class TimetableLogger {
	constructor(private logger: any) {}

	logManualExecution(timezone: string, momentTz: moment.Moment): void {
		this.logger.info(`✓ MANUAL EXECUTION at ${moment.utc(momentTz.toDate()).format('YYYY-MM-DD HH:mm:ss')} UTC`);
		this.logger.info(`Manual execution in timezone ${timezone}: ${momentTz.format('YYYY-MM-DD HH:mm:ss')}`);
	}

	logConfigurationLoaded(timezone: string, hourConfigs: HourConfig[], nextRun?: NextRunTime): void {
		this.logger.info(`Configuration loaded at ${new Date().toISOString()}:`);
		this.logger.info(`Timezone: ${timezone}`);
		this.logger.info(`Hour configs: ${JSON.stringify(hourConfigs)}`);
		
		if (nextRun) {
			this.logger.info(`Next scheduled trigger: ${nextRun.candidate.toISOString()} (${moment.utc(nextRun.candidate).format('YYYY-MM-DD HH:mm:ss')} UTC)`);
		}
	}

	logConfigurationError(timezone: string, hourConfigs: HourConfig[], error: Error | unknown): void {
		this.logger.info(`Configuration loaded at ${new Date().toISOString()}:`);
		this.logger.info(`Timezone: ${timezone}`);
		this.logger.info(`Hour configs: ${JSON.stringify(hourConfigs)}`);
		this.logger.error(`Error computing next run time: ${error instanceof Error ? error.message : 'Unknown error'}`);
		if (error instanceof Error && error.stack) {
			this.logger.error(`Stack trace: ${error.stack}`);
		}
	}

	logCronRegistration(): void {
		this.logger.info('Registering cron job to run every minute for condition checking');
	}

	logTriggerCheck(currentTime: Date, timezone: string, lastTriggerTime: number | undefined, shouldTrigger: boolean): void {
		const currentTimeUtc = moment.utc(currentTime);
		this.logger.debug(`Trigger check at ${currentTimeUtc.format('YYYY-MM-DD HH:mm:ss')} UTC (${currentTime.toISOString()})`);
		this.logger.debug(`Current time in timezone ${timezone}: ${moment.tz(timezone).format('YYYY-MM-DD HH:mm:ss')}`);
		this.logger.debug(`Last trigger time: ${lastTriggerTime ? new Date(lastTriggerTime).toISOString() : 'never'}`);
		this.logger.debug(`Should trigger: ${shouldTrigger}`);
	}

	logSkipTrigger(nextRun: NextRunTime): void {
		this.logger.debug(`Not triggering. Next scheduled: ${moment.utc(nextRun.candidate).format('YYYY-MM-DD HH:mm:ss')} UTC`);
	}

	logSkipTriggerError(error: Error | unknown): void {
		this.logger.error(`Error computing next run time for skip: ${error instanceof Error ? error.message : 'Unknown error'}`);
		if (error instanceof Error && error.stack) {
			this.logger.error(`Stack trace: ${error.stack}`);
		}
	}

	logWorkflowTrigger(currentTime: Date): void {
		this.logger.info(`✓ TRIGGERING WORKFLOW at ${moment.utc(currentTime).format('YYYY-MM-DD HH:mm:ss')} UTC`);
	}

	logWorkflowOutputError(error: Error | unknown): void {
		this.logger.error(`Error creating workflow output: ${error instanceof Error ? error.message : 'Unknown error'}`);
		if (error instanceof Error && error.stack) {
			this.logger.error(`Stack trace: ${error.stack}`);
		}
	}

	logExecutionTriggerError(error: Error | unknown): void {
		this.logger.error(`Error in execution trigger: ${error instanceof Error ? error.message : 'Unknown error'}`);
		if (error instanceof Error && error.stack) {
			this.logger.error(`Stack trace: ${error.stack}`);
		}
	}

	logCronRegistrationError(error: Error | unknown): void {
		this.logger.error(`Failed to register cron job: ${error instanceof Error ? error.message : 'Unknown error'}`);
		if (error instanceof Error && error.stack) {
			this.logger.error(`Cron registration stack trace: ${error.stack}`);
		}
	}

	logTriggerFunctionCreationError(error: Error | unknown): void {
		this.logger.error(`Failed to create trigger function: ${error instanceof Error ? error.message : 'Unknown error'}`);
		if (error instanceof Error && error.stack) {
			this.logger.error(`Trigger function creation stack trace: ${error.stack}`);
		}
	}

	logNormalProcessingError(error: Error | unknown): void {
		this.logger.error(`Error in normal processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
		if (error instanceof Error && error.stack) {
			this.logger.error(`Normal processing stack trace: ${error.stack}`);
		}
	}
}

export const createTimetableLogger = (logger: any): TimetableLogger => {
	return new TimetableLogger(logger);
};