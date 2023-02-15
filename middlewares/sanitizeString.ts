export const sanitizeString = async (obj : any) => {
    for(const data in obj) {
        obj[data] = obj[data].toString();
    }
}

export const isEmail = (email: string) => {
    var emailFormat = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (email !== '' && email.match(emailFormat)) { return true; }
    
    return false;
}