// Constants

const BASE = "";


// Public

/**
    * Basic HTTP client for the ArchiTree API
*/

export const API = {
    /**
        * @param {string} url
        * @returns {Promise<*>}
    */
    async get(url) {
        const res = await fetch(BASE + url);

        if (!res.ok) {
            throw buildError(res);
        }

        return res.json();
    },

    /**
        * @param {string} url
        * @param {*}       body
        * @returns {Promise<*>}
    */
    async post(url, body) {
        const res = await fetch(BASE + url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            throw buildError(res);
        }

        return res.json();
    },
};


// Private

/**
    * @param {Response} res
    * @returns {Error}
*/
function buildError(res) {
    const msg = res.status + " " + res.statusText;

    return new Error(msg);
}
