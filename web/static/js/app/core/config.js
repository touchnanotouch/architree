// Module

import { API } from "./api.js";


// Constants

/** Golden angle in degrees - used to spread group colors evenly */

export const GOLDEN_ANGLE = 137.508;

/** Visual node radii by type */

export const NODE_R = { dir: 12, file: 7 };


// Public

/**
    * Load saved groups for a given workspace
    *
    * @param {string} path Absolute workspace path
    * @returns {Promise<{name:string, paths:string[], color:string}[]>}
*/
export async function loadGroups(path) {
    const config = await API.get(
        "/api/project/config?path=" + encodeURIComponent(path)
    );

    if (!config || !config.groups) {
        return [];
    }

    return config.groups
        .filter(g => g.paths && g.paths.length > 0)
        .map(g => ({
            ...g,
            paths: g.paths.map(p => p.replace(/\\/g, "/")),
        }));
}


/**
    * Persist groups for a given workspace
    *
    * @param {string} path Absolute workspace path
    * @param {Array}  groups
    * @returns {Promise<void>}
*/
export async function saveGroups(path, groups) {
    await API.post("/api/project/config", {
        path: path,
        data: { groups: groups },
    });
}
