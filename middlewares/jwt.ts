import jwt, { Secret, JwtPayload} from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import config from '../config.json';
require('dotenv').config();

export interface JwtPayloadRequest extends Request {
    token: string | JwtPayload
}

export const jwtAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.header('x-access-token') as string || req.header('Authorization') as string;
        const secretKeyJwt : Secret = process.env.JWT_SECRETKEY as Secret;
        if(!token) {
            throw new Error(`${config.messages.tokenInvalid}`);
        }

        const payload = jwt.verify(token, secretKeyJwt);
        (req as JwtPayloadRequest).token = payload;
        res.locals.token = payload;
    
        next();
    } catch(err) {
        res.json(config.messages.tokenInvalid)
    }
}