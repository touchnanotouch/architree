function renderSidebarTree(containerId, nodes, expandedPaths, onToggle, groups) {
    const container = document.getElementById(containerId);

    if (!container) {
        return;
    }

    const pathColor = {};

    if (groups) {
        for (let gi = 0; gi < groups.length; gi++) {
            const g = groups[gi];

            for (let pi = 0; pi < g.paths.length; pi++) {
                pathColor[g.paths[pi]] = g.color;
            }
        }
    }

    container.innerHTML = buildTreeHTML(nodes, expandedPaths, pathColor);

    if (!container._treeDelegation) {
        container.addEventListener("click", e => {
            const header = e.target.closest(".tree-node-header[data-path]");

            if (!header) {
                return;
            }

            const path = header.dataset.path;
            const type = header.dataset.type;

            if (type === "dir") {
                onToggle(path);
            }
        });

        container._treeDelegation = true;
    }
}

function buildTreeHTML(nodes, expandedPaths, pathColor) {
    if (!nodes || !nodes.length) {
        return '<p class="sidebar__placeholder">No workspace selected</p>';
    }

    let html = '<ul class="tree">';

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isDir = node.type === "dir";
        const hasChildren = isDir && node.children && node.children.length;
        const expanded = expandedPaths[node.path];
        const color = pathColor && pathColor[node.path];

        html += '<li class="tree-node">';
        html += '<div class="tree-node-header" data-path="' + escAttr(node.path) + '" data-type="' + node.type + '">';

        if (isDir) {
            html += '<span class="tree-toggle">';

            if (hasChildren) {
                html += expanded
                    ? '<i class="fas fa-chevron-down"></i>'
                    : '<i class="fas fa-chevron-right"></i>';
            }

            html += "</span>";
        }

        html += '<span class="tree-icon tree-icon--' + node.type + '"><i class="fas fa-fw ' + (isDir ? "fa-folder" : "fa-file") + '"></i></span>';

        if (color) {
            html += '<span class="tree-group-dot" style="background:' + color + '"></span>';
        }

        html += '<span class="tree-name">' + escHtml(node.name) + "</span>";
        html += "</div>";

        if (hasChildren) {
            html += '<ul class="tree-children" style="display:' + (expanded ? "block" : "none") + '">';
            html += buildTreeHTML(node.children, expandedPaths, pathColor);
            html += "</ul>";
        }

        html += "</li>";
    }

    html += "</ul>";
    return html;
}

const _htmlEsc = document.createElement("div");

function escHtml(str) {
    _htmlEsc.textContent = str;
    return _htmlEsc.innerHTML;
}

function escAttr(str) {
    return str.replace(/[&"<>]/g, c => _escMap[c]);
}

const _escMap = {
    "&": "&amp;",
    "\"": "&quot;",
    "<": "&lt;",
    ">": "&gt;",
};