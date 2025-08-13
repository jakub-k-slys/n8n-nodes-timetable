import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TimetableTrigger implements ICredentialType {
	name = 'timetableTrigger';
	displayName = 'Timetable Trigger';
	documentationUrl = 'https://timetable-trigger.readthedocs.io';
	properties: INodeProperties[] = [];
}
