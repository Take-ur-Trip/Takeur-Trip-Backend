import { createTransport, SentMessageInfo } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import * as config from '../config.json';
require('dotenv').config();

export const sendMail = async (to : string) => {
    type MailOptions = {
        from: string,
        to: string,
        subject: string,
        html: string
    }

    const emailTransporter : Mail<SentMessageInfo> = createTransport({
        service: "gmail",
        auth: {
            user: process.env.SENDER_EMAIL,
            pass: process.env.SENDER_EMAIL_PASSWORD
        }
    })

    const generateRandomHash = (length : Number) => {
        const chars : string = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result : any = '';
        for(let i=0; i<length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    const mailOptions : MailOptions = {
        from: process.env.SENDER_EMAIL || '',
        to: 'nikodemniq@gmail.com',
        subject: "Aktywacja konta - Takeur' Trip",
        html: `<h1>Aktywuj swoje konto</h1><a href="http://${config.default.default.host}:${config.default.default.port}/users/verify?email=${to}&hash=${generateRandomHash(30)}">Aktywacja konta ${config.default.default.host}:${config.default.default.port}/users/verify?email=${to}&hash=${generateRandomHash(30)}</a>`
      };

    const email = await emailTransporter.sendMail(mailOptions);
    return email;
}