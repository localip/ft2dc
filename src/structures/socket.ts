import { bind, getImage, sleep } from '@utilities';
import { PayloadTypes, URL } from '@constants';
import { createLogger } from '@lib/logger';
import Webhook from '@lib/webhook';
import config from '@config';
import API from '@lib/api';
import WebSocket from 'ws';

export default class Socket extends WebSocket {
	logger = createLogger('FT', 'WebSocket');

	constructor() {
		super(URL.WebSocket + '?authorization=' + config.auth);
		this.logger.info('Attempting to establish connection...');

		this.on('message', this.onMessage);
		this.on('error', this.onMessage);
		this.on('open', this.onConnect);
		this.on('close', this.onClose);
	}

	@bind
	onMessage(event: WebSocket.MessageEvent): void {
		try {
			const payload = JSON.parse(String(event));
			if (!payload) return;

			switch (payload.type) {
				case PayloadTypes.PING:
					this.logger.debug('(«) Ping.');
					break;
				case PayloadTypes.PONG:
					this.logger.debug('(») Pong.');
					break;
				case PayloadTypes.RECEIVED_MESSAGE:
					this.onFTMessage(payload);
					break;
			}
		} catch (error) {
			this.logger.error('Failed to parse message:', error);
		}
	};

	@bind
	async onFTMessage(message: Message) {
		this.logger.debug('Message received:', message.text);

		if (!API.chats.find(chat => chat.chatRoomId === message.chatRoomId)) {
			await API.getChats();
		}

		const chat = API.chats.find(chat => chat.chatRoomId === message.chatRoomId);
		const images = [];

		for (const image of message.imageUrls) {
			const buffer = await getImage(image);
			images.push(buffer);
		}

		Webhook.send({
			avatar_url: message.twitterPfpUrl,
			username: `${message.twitterName} (from ${chat.username})`,
			content: [
				message.replyingToMessage && `**Replying to ${message.replyingToMessage.twitterName}**`,
				message.replyingToMessage && `${message.replyingToMessage.text.slice(1, -1)}`,
				(message.replyingToMessage && '>>> ' ? '') + message.text.slice(1, -1)
			].filter(Boolean).join('\n')
		}, images);
	}

	@bind
	onConnect(): void {
		this.logger.success('Connection successfully established.');
		this.sendPing();
	};

	@bind
	onClose(event: WebSocket.CloseEvent): void {
		this.logger.warn('WebSocket connection terminated:', event);
		this.logger.info('WebSocket attempting reconnection...');

		new Socket();
	};

	@bind
	onError(event: WebSocket.ErrorEvent): void {
		this.logger.error('An error occured:', event.error);
	};

	@bind
	transmit(payload: Record<any, any>) {
		const json = JSON.stringify(payload);
		return this.send(json);
	}

	async sendPing() {
		if (this.readyState !== WebSocket.OPEN) return;

		this.transmit({ action: 'ping' });
		this.logger.debug('(«) Ping.');

		await sleep(2500);
		this.sendPing();
	}
}