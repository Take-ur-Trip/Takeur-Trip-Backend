import rateLimit from "express-rate-limit";
import { log } from "./db";
import config from '../config.json';

export const requestRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: `You have exceeded rate limit. Try again later!`,
    handler: async (req, res, next, options) => {
        const { path, ip } = req;
        await log([`RATE LIMIT ${JSON.stringify({path, ip})}`, options.statusCode, config.log_type.INTERNAL]);
        res.status(options.statusCode).json(options.message);
    }
})

