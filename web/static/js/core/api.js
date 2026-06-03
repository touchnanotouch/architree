var API = {
    get: async function(url) {
        var res = await fetch(url);

        if (!res.ok) {
            throw new Error(res.status + " " + res.statusText);
        }

        return res.json();
    },

    post: async function(url, body) {
        var res = await fetch(url, {
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
