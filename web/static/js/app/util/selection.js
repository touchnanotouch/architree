// Public

/**
    * Expand a set of paths to include every ancestor directory
    *
    * @param {string[]} paths Relative paths ("foo/bar.js")
    * @returns {string[]} All ancestor paths including the originals
*/
export function collectAncestors(paths) {
    const result = {};

    for (let i = 0; i < paths.length; i++) {
        const parts = paths[i].split("/").filter(Boolean);

        let cur = "";
        for (let j = 0; j < parts.length; j++) {
            cur = cur ? cur + "/" + parts[j] : parts[j];
            result[cur] = true;
        }
    }

    return Object.keys(result);
}


/**
    * Expand a set of paths to include every descendant
    *
    * @param {string[]} paths Relative paths ("foo/bar.js")
    * @param {{path:string, children:[]}[]} nodes Tree returned by the scan API
    * @returns {string[]} All descendant paths including the originals
*/
export function collectDescendants(paths, nodes) {
    const result = {};
    const pathToNode = {};

    buildLookup(nodes, pathToNode);

    for (let i = 0; i < paths.length; i++) {
        result[paths[i]] = true;

        const node = pathToNode[paths[i]];

        if (node && node.children) {
            walkDescendants(node.children, result);
        }
    }

    return Object.keys(result);
}


// Private

/**
    * Walk helper - recursively mark every descendant path
    *
    * @param {{path:string, children:[]}[]} nodes
    * @param {Record<string, true>} result  Mutated in-place
*/
function walkDescendants(nodes, result) {
    for (let i = 0; i < nodes.length; i++) {
        result[nodes[i].path] = true;

        if (nodes[i].children) {
            walkDescendants(nodes[i].children, result);
        }
    }
}


/**
    * Build helper - flatten a tree into a path-to-node lookup map
    *
    * @param {{path:string, children:[]}[]} nodes
    * @param {Record<string, *>} map Mutated in-place
*/
function buildLookup(nodes, map) {
    for (let i = 0; i < nodes.length; i++) {
        map[nodes[i].path] = nodes[i];

        if (nodes[i].children) {
            buildLookup(nodes[i].children, map);
        }
    }
}
