import { Request, Response } from "express";
import query from '../middlewares/db';
import Router from "express-promise-router";
import config from '../config.json';
import bcrypt from 'bcrypt';
import { sanitizeString } from "../middlewares/sanitizeString";
import { generateRandomHash, sendMail } from "../middlewares/mailer";
import { QueryResult } from "pg";
import jwt, { Secret } from 'jsonwebtoken';
import { jwtAuth } from "../middlewares/jwt";
require('dotenv').config();

const router = Router();
const secretKeyJwt : Secret = process.env.JWT_SECRETKEY as Secret;

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
            const verifyHash = await generateRandomHash(30);
            await sendMail(user.email, verifyHash);
            await query(`UPDATE "public.Users" SET verification=$1 WHERE email LIKE $2`, [verifyHash, user.email]);
            const token : string = jwt.sign(user.email, secretKeyJwt);
            const tokenObj : Object = { token };
            res.json({...config.messages.registredUser, ...tokenObj});
        } else {
            res.json(config.messages.couldntRegisterUser);
        }
    }
});

router.get('/verify', async (req : Request, res: Response) => {
    const email = req.query.email as string;
    const hash = req.query.hash as string;
    const { rows : emailRows} = await query(`SELECT email FROM "public.Users" WHERE email LIKE $1`, [email]);
    if(emailRows.length < 1) {
        res.json(config.messages.verifyError);
    } else {
        const { rows : isVerified} = await query(`SELECT email FROM "public.Users" WHERE email LIKE $1 AND verification LIKE '1'`, [email]);
        if(isVerified.length > 0) {
            res.json(config.messages.alreadyVerified)
        } else {
            const { rowCount : verify } : QueryResult = await query(`UPDATE "public.Users" SET verification='1' WHERE  email LIKE $1 AND verification LIKE $2`, [email, hash]);
            if(verify < 1) {
                res.json(config.messages.verifyError);
            } else {
                res.json(config.messages.verifySuccessful);
            }
        }
    }
})

// Auth
router.post('/auth', async (req : Request, res : Response) => {
    const email = req.body.email as string;
    const password = req.body.password as string;
    const { rows : emailRows} = await query(`SELECT email, password FROM "public.Users" WHERE email LIKE $1`, [email]);
    if(emailRows.length < 1) {
        res.json(config.messages.authIncorrectCredentials);
    } else {
        const encryptedPassword = await bcrypt.compare(password, emailRows[0].password);
        if(!encryptedPassword) {
            res.json(config.messages.authIncorrectCredentials);
        } else {
            const { rowCount : banned } = await query(`SELECT email, "isBanned" FROM "public.Users" WHERE email = $1 AND "isBanned" = true`, [email]);
            if(!banned) {
                const token : string = jwt.sign(emailRows[0].email, secretKeyJwt);
                const tokenObj : Object = { token };
                res.json({...config.messages.authSuccess, ...tokenObj})
            } else {
                res.json(config.messages.userBanned)
            }
        }
    }
})

router.post('/ban/:userId', async (req: Request, res: Response) => {
    const masterPasswordSecret : Secret = process.env.MASTER_PASSWORD as Secret;
    const masterPassword = req.body.masterPassword as string;
    const userId = req.params.userId as string;
    if(masterPasswordSecret == masterPassword) {
        const { rows : emailRows} = await query(`SELECT email, "isBanned" FROM "public.Users" WHERE "userId" = $1`, [userId]);
        const { rowCount } : QueryResult = await query(`UPDATE "public.Users" SET "isBanned"=true WHERE email=$1 AND ("isBanned" is NULL OR "isBanned"=false)`, [emailRows[0].email as string]);
        console.log(rowCount)
        if((rowCount < 1)) {
            res.json(config.messages.userAlreadyBanned);
        } else {
            res.json(config.messages.bannedSuccessful);
        }
    } else {
        res.json(config.messages.authIncorrectCredentials);
    }
})

router.post('/unban/:userId', async (req: Request, res: Response) => {
    const masterPasswordSecret : Secret = process.env.MASTER_PASSWORD as Secret;
    const masterPassword = req.body.masterPassword as string;
    const userId = req.params.userId as string;
    if(masterPasswordSecret == masterPassword) {
        const { rows : emailRows} = await query(`SELECT email, "isBanned" FROM "public.Users" WHERE "userId" = $1`, [userId]);
        const { rowCount } : QueryResult = await query(`UPDATE "public.Users" SET "isBanned"=false WHERE email=$1 AND "isBanned"=true`, [emailRows[0].email as string]);
        if((rowCount < 1)) {
            res.json(config.messages.hasntBanned);
        } else {
            res.json(config.messages.unbannedSuccessful);
        }
    } else {
        res.json(config.messages.authIncorrectCredentials);
    }
})

// Only for authenticated users ( Protected routes )
router.get('/fetch', jwtAuth, async (req : Request, res: Response) => {
    try {
        const { rows : users} = await query(`SELECT * FROM "public.Users"`, []);
        res.json(users);
    } catch(err) {
        res.json(config.messages.fetchingUserError);
    }
})

router.get('/fetch/:id', jwtAuth, async (req : Request, res: Response) => {
    try {
        const userId : string = req.params.id;
        const { rows : user} = await query(`SELECT * FROM "public.Users" WHERE "userId" = $1`, [userId]);
        res.json(user);
    } catch(err) {
        res.json(config.messages.fetchingUserError);
    }
})


export default router;