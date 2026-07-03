export default class ServiceError extends Error {
	public readonly status: number;
	public readonly details: string[];

	public constructor(status: number, message: string, details: string[] = []) {
		super(message);
		this.name = "ServiceError";
		this.status = status;
		this.details = details;
	}
}

