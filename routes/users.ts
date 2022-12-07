import { Request, Response } from "express";
import query, {log} from '../middlewares/db';
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
};
// Registering an user
router.post('/register', async (req: Request<CredentialsModel>, res: Response) => {
    try {
        const user : CredentialsModel = {
            email : req.body.email, 
            password : req.body.password
        }
        await sanitizeString(user)
        const { rows : emailRows} = await query(`SELECT email FROM "public.Users" WHERE email LIKE $1`, [user.email]);
        if(!(emailRows.length < 1)) {
            res.json(config.messages.userAlreadyRegistred).status(config.response_status.prohibition);
        } else {
            const saltHash = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(user.password, saltHash);
            const {rowCount: regQuery} = await query(`INSERT INTO "public.Users" (email, password, "accountCreated") VALUES($1, $2, NOW())`, [user.email, hashedPassword]);
            if(regQuery > 0) {
                const { rows : registredUser} = await query(`SELECT * FROM "public.Users" WHERE email LIKE $1`, [user.email]);
                const token : string = jwt.sign({userId: registredUser[0].userId, email: registredUser[0].email}, secretKeyJwt);
                await sendMail(user.email, token);
                await log([`REGISTER ACTION ${JSON.stringify({email: user.email, token})}`, config.response_status.access, config.log_type.USERS]);
                // await query(`UPDATE "public.Users" SET verification=$1 WHERE email LIKE $2`, [verifyHash, user.email]);
                const resUserObj : Object = { token, user: registredUser };
                res.set({
                    'Authorization' : token
                }).json({...config.messages.registredUser, ...resUserObj}).status(config.response_status.access);
            } else {
                await log([`REGISTER ACTION ${JSON.stringify(user.email)}`, config.response_status.internalError, config.log_type.USERS]);
                res.json(config.messages.couldntRegisterUser).status(config.response_status.internalError);
            }
        }
    } catch (error) {
        await log([`REGISTER ACTION ${error}`, config.response_status.internalError, config.log_type.USERS]);
        res.json(config.messages.couldntRegisterUser).status(config.response_status.internalError);
    }
});

router.get('/verify', async (req : Request, res: Response) => {
    try {
        const email = req.query.email as string;
        const hash = req.query.hash as string;
        const { rows : emailRows} = await query(`SELECT email FROM "public.Users" WHERE email LIKE $1`, [email]);
        if(emailRows.length < 1) {
            await log([`VERIFY ACTION ${JSON.stringify(hash)}`, config.response_status.prohibition, config.log_type.USERS]);
            res.json(config.messages.verifyError).status(config.response_status.prohibition);
        } else {
            const { rows : isVerified} = await query(`SELECT email FROM "public.Users" WHERE email LIKE $1 AND verification = true`, [email]);
            if(isVerified.length > 0) {
                await log([`VERIFY ACTION ${JSON.stringify({...config.messages.alreadyVerified, ...{email}})}`, config.response_status.prohibition, config.log_type.USERS]);
                res.json(config.messages.alreadyVerified).status(config.response_status.prohibition)
            } else {
                const verifyPayload : any = jwt.verify(hash, process.env.JWT_SECRETKEY as Secret);
                if(!(verifyPayload.email == email)) {
                    await log([`VERIFY ACTION ${JSON.stringify(hash)}`, config.response_status.internalError, config.log_type.USERS]);
                    res.json(config.messages.verifyError).status(config.response_status.internalError);
                } else {
                    const verifyQuery : QueryResult = await query(`UPDATE "public.Users" SET verification=true WHERE  email LIKE $1`, [email]);
                    if(verifyQuery.rowCount <= 0) {
                        res.json(config.messages.verifyError).status(config.response_status.internalError);
                    } else {
                        await log([`VERIFY ACTION ${JSON.stringify(hash)}`, config.response_status.access, config.log_type.USERS]);
                        res.json(config.messages.verifySuccessful).status(config.response_status.access);
                    }
                }
            }
        }
    } catch(error) {
        await log([`VERIFY ACTION ${error}`, config.response_status.internalError, config.log_type.USERS]);
        res.json(config.messages.verifyError).status(config.response_status.internalError);
    }
})

// Auth
router.post('/auth', async (req : Request, res : Response) => {
    try {
        const email = req.body.email as string;
        const password = req.body.password as string;
        const { rows : emailRows} = await query(`SELECT * FROM "public.Users" WHERE email LIKE $1`, [email]);
        if(emailRows.length < 1) {
            await log([`AUTH ACTION ${JSON.stringify(email)}`, config.response_status.prohibition, config.log_type.USERS]);
            res.json(config.messages.authIncorrectCredentials).status(config.response_status.prohibition);
        } else {
            const encryptedPassword = await bcrypt.compare(password, emailRows[0].password);
            if(!encryptedPassword) {
                await log([`AUTH ACTION ${JSON.stringify(email)}`, config.response_status.prohibition, config.log_type.USERS]);
                res.json(config.messages.authIncorrectCredentials).status(config.response_status.prohibition);
            } else {
                const { rowCount : banned } = await query(`SELECT email, "isBanned" FROM "public.Users" WHERE email = $1 AND "isBanned" = true`, [email]);
                if(!banned) {
                    const token : string = jwt.sign({userId: emailRows[0].userId,email: emailRows[0].email}, secretKeyJwt);
                    const tokenObj : Object = { token };
                    await log([`AUTH ACTION ${JSON.stringify(email)}`, config.response_status.access, config.log_type.USERS]);
                    res.json({...config.messages.authSuccess, ...tokenObj, user: emailRows}).status(config.response_status.access)
                } else {
                    await log([`AUTH ACTION ${JSON.stringify(email)}`, config.response_status.prohibition, config.log_type.USERS]);
                    res.json(config.messages.userBanned).status(config.response_status.prohibition)
                }
            }
        }
    } catch(error) {
        await log([`AUTH ACTION ${error}`, config.response_status.internalError, config.log_type.USERS]);
        res.json(config.messages.authError).status(config.response_status.internalError);
    }
})

router.post('/ban/:userId', jwtAuth, async (req: Request, res: Response) => {
    try {
        const masterPasswordSecret : Secret = process.env.MASTER_PASSWORD as Secret;
        const masterPassword = req.body.masterPassword as string;
        const userId = req.params.userId as string;
        if(masterPasswordSecret == masterPassword) {
            const { rows : emailRows} : QueryResult = await query(`SELECT email, "isBanned" FROM "public.Users" WHERE "userId" = $1`, [userId]);
            const { rowCount } : QueryResult = await query(`UPDATE "public.Users" SET "isBanned"=true WHERE email=$1 AND ("isBanned" is NULL OR "isBanned"=false)`, [emailRows[0].email as string]);
            if((rowCount < 1)) {
                await log([`BAN ACTION ${JSON.stringify(userId)}`, config.response_status.prohibition, config.log_type.USERS]);
                res.json(config.messages.userAlreadyBanned).status(config.response_status.prohibition);
            } else {
                await log([`BAN ACTION ${JSON.stringify(userId)}`, config.response_status.access, config.log_type.USERS]);
                res.json(config.messages.bannedSuccessful).status(config.response_status.access);
            }
        } else {
            await log([`BAN ACTION ${JSON.stringify(userId)}, ${JSON.stringify(masterPassword)}`, config.response_status.prohibition, config.log_type.USERS]);
            res.json(config.messages.authIncorrectCredentials).status(config.response_status.prohibition);
        }
    } catch(error) {
        await log([`BAN ACTION ${error}`, config.response_status.internalError, config.log_type.USERS]);
        res.json(config.messages.couldntBanOrUnban).status(config.response_status.internalError);
    }
})

router.post('/unban/:userId', jwtAuth, async (req: Request, res: Response) => {
    try {
        const masterPasswordSecret : Secret = process.env.MASTER_PASSWORD as Secret;
        const masterPassword = req.body.masterPassword as string;
        const userId = req.params.userId as string;
        if(masterPasswordSecret == masterPassword) {
            const { rows : emailRows} = await query(`SELECT email, "isBanned" FROM "public.Users" WHERE "userId" = $1`, [userId]);
            const { rowCount } : QueryResult = await query(`UPDATE "public.Users" SET "isBanned"=false WHERE email=$1 AND "isBanned"=true`, [emailRows[0].email as string]);
            if((rowCount < 1)) {
                await log([`UNBAN ACTION ${JSON.stringify(userId)}`, config.response_status.prohibition, config.log_type.USERS]);
                res.json(config.messages.hasntBanned).status(config.response_status.prohibition);
            } else {
                await log([`UNBAN ACTION ${JSON.stringify(userId)}`, config.response_status.access, config.log_type.USERS]);
                res.json(config.messages.unbannedSuccessful).status(config.response_status.access);
            }
        } else {
            await log([`UNBAN ACTION ${JSON.stringify(userId)}`, config.response_status.prohibition, config.log_type.USERS]);
            res.json(config.messages.authIncorrectCredentials).status(config.response_status.prohibition);
        }
    } catch(error) {
        await log([`UNBAN ACTION ${error}`, config.response_status.internalError, config.log_type.USERS]);
        res.json(config.messages.couldntBanOrUnban).status(config.response_status.internalError);
    }
})

// Only for authenticated users ( Protected routes )

//Fetching user(s) data
router.get('/fetch', jwtAuth, async (req : Request, res: Response) => {
    try {
        if(res.locals.isAdmin) {
            const { rows : users} = await query(`SELECT * FROM "public.Users"`, []);
            res.json(users).status(config.response_status.access);
        } else {
            const { rows : users} = await query(`SELECT email, "isDriver", pricing, bio, phone, "lastLocation", "accountCreated", verification FROM "public.Users"`, []);
            res.json(users).status(config.response_status.access);        
        }
    } catch(err) { 
        res.json(config.messages.fetchingUserError).status(config.response_status.internalError);
    }
})


router.get('/fetchByMail/:email', jwtAuth, async (req : Request, res: Response) => {
    try {
        const userEmail : string = req.params.email;
        if(res.locals.isAdmin) {
            const { rows : user} = await query(`SELECT * FROM "public.Users" WHERE email = $1`, [userEmail]);
            res.json(user).status(config.response_status.access);
        } else {
            const { rows : users} = await query(`SELECT email, "isDriver", pricing, bio, phone, "lastLocation", "accountCreated", verification FROM "public.Users" WHERE email = $1`, [userEmail]);
            res.json(users).status(config.response_status.access);     
        }
    } catch(err) {
        console.log(err)
        res.json(config.messages.fetchingUserError).status(config.response_status.internalError);
    }
})


router.get('/fetch/:id', jwtAuth, async (req : Request, res: Response) => {
    try {
        const userId : string = req.params.id;
        if(res.locals.isAdmin) {
            const { rows : user} = await query(`SELECT * FROM "public.Users" WHERE "userId" = $1`, [userId]);
            res.json(user).status(config.response_status.access);
        } else {
            const { rows : users} = await query(`SELECT email, "isDriver", pricing, bio, phone, "lastLocation", "accountCreated", verification FROM "public.Users" WHERE "userId" = $1`, [userId]);
            res.json(users).status(config.response_status.access);    
        }
    } catch(err) {
        res.json(config.messages.fetchingUserError).status(config.response_status.internalError);
    }
})


// Admin dashboard routes!
router.post('/authAdmin', async (req : Request, res : Response) => {
    try {
        const login = req.body.login as string;
        const password = req.body.password as string;
        const { rows : loginRows} = await query(`SELECT login, password FROM "public.AdminUsers" WHERE login LIKE $1`, [login]);
        if(loginRows.length < 1) {
            await log([`AUTH ACTION ${JSON.stringify(login)} TO ADMIN DASHBOARD`, config.response_status.prohibition, config.log_type.USERS]);
            res.json(config.messages.authIncorrectCredentials).status(config.response_status.prohibition);
        } else {
            const encryptedPassword = await bcrypt.compare(password, loginRows[0].password);
            if(!encryptedPassword) {
                await log([`AUTH ACTION ${JSON.stringify(login)} TO ADMIN DASHBOARD`, config.response_status.prohibition, config.log_type.USERS]);
                res.json(config.messages.authIncorrectCredentials).status(config.response_status.prohibition);
            } else {
                const token : string = jwt.sign({login: loginRows[0].login, isAdmin: true}, secretKeyJwt);
                const tokenObj : Object = { token };
                await log([`AUTH ACTION ${JSON.stringify(login)} TO ADMIN DASHBOARD`, config.response_status.access, config.log_type.USERS]);
                res.json({...config.messages.authSuccess, ...tokenObj}).status(config.response_status.access)
            }
        }
    } catch(error) {
        await log([`MASTER AUTH ACTION ${error}`, config.response_status.internalError, config.log_type.USERS]);
        res.json(config.messages.authError).status(config.response_status.internalError);
    }
})

router.post('/terminateUser', jwtAuth, async (req: Request, res: Response) => {
    try {
        const {email, userId} = res.locals.token;
        // Check if user exists
        const { rowCount : emailRowCount} = await query(`SELECT email FROM "public.Users" WHERE email LIKE $1`, [email]);
        if(emailRowCount) {
            await query(`BEGIN`, []);
            const { rows : ratingsDeletion} = await query(`DELETE FROM "public.Ratings" where "userId" = $1;`, [userId]);
            const { rows : tripStatusUpdate} = await query(`UPDATE "public.Trips" SET status='${config.tripStatus.canceled}' WHERE "passengerId" = $1 OR "driverId" = $1;`, [userId]);
            const { rows : driversUpdate} = await query(`UPDATE "public.Trips" SET "driverId"=null WHERE "driverId" = $1;`, [userId]);
            const { rows : passengersUpdate} = await query(`UPDATE "public.Trips" SET "passengerId"=null WHERE "passengerId" = $1;`, [userId]);
            const { rowCount : userDeletion} = await query(`DELETE FROM "public.Users" where "userId" = $1;`, [userId]);
            await query(`COMMIT;`, []);
            if(userDeletion && ratingsDeletion && driversUpdate && passengersUpdate && tripStatusUpdate) {  
                await log([`TERMINATING USER ACTION ${userId}`, config.response_status.access, config.log_type.USERS]);
                res.json(config.messages.terminatingUserSuccessful).status(config.response_status.access);  
            } else {
                console.log(userDeletion)
                await log([`TERMINATING USER ACTION ${userId}`, config.response_status.internalError, config.log_type.USERS]);
                res.json(config.messages.couldntTerminateUser).status(config.response_status.internalError);  
            }
        } else {
            await log([`TERMINATING USER ACTION ${userId}`, config.response_status.prohibition, config.log_type.USERS]);
            res.json(config.messages.couldntTerminateUser).status(config.response_status.prohibition);
        }
    } catch (error) {
        console.log(error)
        await log([`TERMINATING USER ACTION ${error}`, config.response_status.internalError, config.log_type.USERS]);
        res.json(config.messages.couldntTerminateUser).status(config.response_status.internalError);
    }

})

export default router;