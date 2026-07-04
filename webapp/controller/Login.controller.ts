import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageBox from 'sap/m/MessageBox';
import MessageToast from 'sap/m/MessageToast';

import BaseController from './BaseController';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class Login extends BaseController {
	public onInit(): void {
		const model = new JSONModel({
			userName: '',
			password: ''
		});
		this.setModel(model, 'login');
	}

	public async onLogin(): Promise<void> {
		const uiModel = this.getUiModel();
		const loginModel = this.getModel('login') as JSONModel;
		const { userName, password } = loginModel.getData() as { userName: string; password: string };

		if (!userName?.trim() || !password?.trim()) {
			MessageBox.error('Username and password are required.');
			return;
		}

		uiModel.setProperty('/loginBusy', true);
		try {
			const auth = this.getOwnerComponent().getAuthenticationService();
			const session = await auth.login(userName.trim(), password);
			this.getSessionModel().setData(session);
			MessageToast.show(`Welcome, ${session.userName}`);
			this.getRouter().navTo('home', {}, true);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			uiModel.setProperty('/loginBusy', false);
		}
	}
}
