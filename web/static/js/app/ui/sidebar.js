// Constants

const ESC_MAP = {
    "&": "&amp;",
    "\"": "&quot;",
    "<": "&lt;",
    ">": "&gt;",
};

const ESC_RE = /[&"<>]/g;


// Vars

var _escElem;


// Public

/**
    * Render the file tree into a sidebar container and set up event delegation
    *
    * @param {string} containerId
    * @param {{name:string, path:string, type:string, children:[]}[]} nodes
    * @param {Record<string, boolean>} expandedPaths
    * @param {function(string)} onToggle  Called when a directory is clicked
    * @param {{name:string, paths:string[], color:string}[]} groups
*/
export function renderSidebarTree(containerId, nodes, expandedPaths, onToggle, groups) {
    var container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    var pathColor = {};

    if (groups) {
        for (var gi = 0; gi < groups.length; gi++) {
            var g = groups[gi];

            for (var pi = 0; pi < g.paths.length; pi++) {
                pathColor[g.paths[pi]] = g.color;
            }
        }
    }

    container.innerHTML = buildTreeHTML(nodes, expandedPaths, pathColor);

    if (container._treeDelegation) {
        return;
    }

    container.addEventListener("click", function (e) {
        var header = e.target.closest(".tree-node-header[data-path]");

        if (!header) {
            return;
        }

        if (header.dataset.type === "dir") {
            onToggle(header.dataset.path);
        }
    });

    container._treeDelegation = true;
}


// Private

/**
    * Build the sidebar tree markup recursively
    *
    * @param {{name:string, path:string, type:string, children:[]}[]} nodes
    * @param {Record<string, boolean>} expandedPaths
    * @param {Record<string, string>}  pathColor
    * @returns {string}
*/
function buildTreeHTML(nodes, expandedPaths, pathColor) {
    if (!nodes || !nodes.length) {
        return '<p class="sidebar__placeholder">No workspace selected</p>';
    }

    var out = ['<ul class="tree">'];

    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];

        var isDir = node.type === "dir";

        var hasChildren = isDir && node.children && node.children.length;
        var expanded = expandedPaths && expandedPaths[node.path];

        var color = pathColor && pathColor[node.path];

        out.push('<li class="tree-node">');
        out.push(
            '<div class="tree-node-header" data-path="',
            escAttr(node.path),
            '" data-type="',
            node.type,
            '">'
        );

        if (isDir) {
            out.push('<span class="tree-toggle">');

            if (hasChildren) {
                out.push(
                    expanded
                        ? '<i class="fas fa-chevron-down"></i>'
                        : '<i class="fas fa-chevron-right"></i>'
                );
            }

            out.push("</span>");
        }

        out.push(
            '<span class="tree-icon tree-icon--',
            node.type,
            '"><i class="fas fa-fw ',
            isDir ? "fa-folder" : "fa-file",
            '"></i></span>'
        );

        if (color) {
            out.push(
                '<span class="tree-group-dot" style="background:',
                color,
                '"></span>'
            );
        }

        out.push('<span class="tree-name">', escHtml(node.name), "</span>");
        out.push("</div>");

        if (hasChildren) {
            out.push(
                '<ul class="tree-children" style="display:',
                expanded ? "block" : "none",
                '">'
            );
            out.push(buildTreeHTML(node.children, expandedPaths, pathColor));
            out.push("</ul>");
        }

        out.push("</li>");
    }

    out.push("</ul>");

    return out.join("");
}


/**
    * Escape a string for safe use as HTML text content
    *
    * @param {string} str
    * @returns {string}
*/
function escHtml(str) {
    if (!_escElem) {
        _escElem = document.createElement("div");
    }

    _escElem.textContent = str;

    return _escElem.innerHTML;
}


/**
    * Escape a string for safe use in HTML attribute values
    *
    * @param {string} str
    * @returns {string}
*/
function escAttr(str) {
    return str.replace(ESC_RE, function (c) { return ESC_MAP[c]; });
}
