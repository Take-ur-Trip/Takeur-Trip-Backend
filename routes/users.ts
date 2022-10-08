import { Request, Response } from "express";
import query from '../middlewares/db';
import Router from "express-promise-router";
import config from '../config.json';
import bcrypt from 'bcrypt';
import { sanitizeString } from "../middlewares/sanitizeString";
import { sendMail } from "../middlewares/mailer";
import { ParsedUrlQuery } from "querystring";

const router = Router();

type CredentialsModel = {
    email : string,
    password : string
}
// Registering an user
router.post('/register', async (req: Request<CredentialsModel>, res: Response) => { 
    const user : CredentialsModel = {
        email : req.body.email, 
        password : req.body.password
    }
    await sanitizeString(user)
    const { rows : emailRows} = await query(`SELECT email FROM "public.Users" WHERE email LIKE $1`, [user.email]);
    if(!(emailRows.length < 1)) {
        res.json(config.messages.userAlreadyRegistred)
    } else {
        const saltHash = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(user.password, saltHash);
        const {rowCount : ifRegisteredUser } = await query(`INSERT INTO "public.Users" (email, password, "accountCreated") VALUES($1, $2, NOW())`, [user.email, hashedPassword]);
        if(ifRegisteredUser > 0) {
            await sendMail(user.email);
            res.json(config.messages.registredUser);
        } else {
            res.json(config.messages.couldntRegisterUser);
        }
    }
});

router.get('/verify', async (req : Request, res: Response) => {
    const email = req.query.email as string;
    const { rows : emailRows} = await query(`SELECT email FROM "public.Users" WHERE email LIKE $1`, [email]);
    if(emailRows.length < 1) {
        res.json(config.messages.verifyError);
    } else {
        const { rows : isVerified} = await query(`SELECT email FROM "public.Users" WHERE email LIKE $1 AND isverified=true`, [email]);
        if(isVerified.length > 0) {
            res.json(config.messages.alreadyVerified)
        } else {
            await query(`UPDATE "public.Users" SET isverified=true WHERE email LIKE $1`, [email]);
            res.json(config.messages.verifySuccessful);
        }
    }
})

export default router;