import type { Job, Registry } from "./types";

export default {
	formatUpperCase: (value: string): string => {
		return value?.toUpperCase() ?? '';
	},

	formatDateTime: (value: string): string => {
		if (!value) {
			return '';
		}

		return new Intl.DateTimeFormat('en', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	},

	formatDuration: (durationMs: number | null): string => {
		if (durationMs === null || durationMs === undefined) {
			return '';
		}

		const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}m ${seconds}s`;
	},

	formatRegistryStatus: (status: Registry['status']): string => {
		return status ?? '';
	},

	formatJobStatus: (status: Job['status']): string => {
		return status ?? '';
	},

	formatStatusState: (status: Registry['status'] | Job['status']): 'Success' | 'Warning' | 'Error' | 'Information' | 'None' => {
		switch (status) {
			case 'Publish':
			case 'Completed':
				return 'Success';
			case 'Unpublish':
			case 'Queued':
				return 'Warning';
			case 'Archive':
				return 'None';
			case 'Failed':
				return 'Error';
			case 'Running':
				return 'Information';
			default:
				return 'None';
		}
	},

	formatXml: (value: string): string => {
		return value ?? '';
	}
};
