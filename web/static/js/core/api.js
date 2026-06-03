const API = {
    async get(url) {
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(res.status + " " + res.statusText);
        }

        return res.json();
    },

    async post(url, body) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            throw new Error(res.status + " " + res.statusText);
        }

        return res.json();
    },
};
