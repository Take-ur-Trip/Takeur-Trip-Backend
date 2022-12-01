import { createTransport, SentMessageInfo } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import * as config from '../config.json';
import fs from "fs";
import path from "path";
import handlebars from "handlebars";
require('dotenv').config();

export const generateRandomHash = async (length : Number) => {
    const chars : string = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result : any = '';
    for(let i=0; i<length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

const htmlSrc = fs.readFileSync(path.join(__dirname, 'mailer.template.hbs'), 'utf-8');
const template = handlebars.compile(htmlSrc);

export const sendMail = async (to : string, verifyHash : string) => {
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
    
    const mailOptions : MailOptions = {
        from: process.env.SENDER_EMAIL || '',
        to: 'nikodemniq@gmail.com',
        subject: "Aktywacja konta - Takeur' Trip",
        html: template({to, verifyLink: `http://${config.default.default.host}:${config.default.default.port}/users/verify?email=${to}&hash=${verifyHash}`})
      };

    const email = await emailTransporter.sendMail(mailOptions);
    return email;
}