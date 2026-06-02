function renderSidebarTree(containerId, nodes, expandedPaths, onToggle, groups) {
    var container = document.getElementById(containerId)

    if (!container) return

    var pathColor = {}

    if (groups) {
        for (var gi = 0; gi < groups.length; gi++) {
            var g = groups[gi]

            for (var pi = 0; pi < g.paths.length; pi++) {
                pathColor[g.paths[pi]] = g.color
            }
        }
    }

    container.innerHTML = buildTreeHTML(nodes, expandedPaths, pathColor)
    container.querySelectorAll(".tree-node-header[data-path]").forEach(function(el) {
        el.addEventListener("click", function(e) {
            e.stopPropagation()

            var path = e.currentTarget.dataset.path
            var type = e.currentTarget.dataset.type

            if (type === "dir") onToggle(path)
        })
    })
}

function buildTreeHTML(nodes, expandedPaths, pathColor) {
    if (!nodes || !nodes.length) return '<p class="sidebar__placeholder">No workspace selected</p>'

    var html = '<ul class="tree">'

    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i]
        var isDir = node.type === "dir"
        var hasChildren = isDir && node.children && node.children.length
        var expanded = expandedPaths && expandedPaths[node.path]
        var color = pathColor && pathColor[node.path]

        html += '<li class="tree-node">'
        html += '<div class="tree-node-header" data-path="' + escAttr(node.path) + '" data-type="' + node.type + '">'

        if (isDir) {
            html += '<span class="tree-toggle">'

            if (hasChildren) {
                html += expanded
                    ? '<i class="fas fa-chevron-down"></i>'
                    : '<i class="fas fa-chevron-right"></i>'
            }

            html += "</span>"
        }

        html += '<span class="tree-icon tree-icon--' + node.type + '"><i class="fas fa-fw ' + (isDir ? "fa-folder" : "fa-file") + '"></i></span>'

        if (color) {
            html += '<span class="tree-group-dot" style="background:' + color + '"></span>'
        }

        html += '<span class="tree-name">' + escHtml(node.name) + "</span>"
        html += "</div>"

        if (hasChildren) {
            html += '<ul class="tree-children" style="display:' + (expanded ? "block" : "none") + '">'
            html += buildTreeHTML(node.children, expandedPaths, pathColor)
            html += "</ul>"
        }

        html += "</li>"
    }

    html += "</ul>"
    return html
}

function escHtml(str) {
    var d = document.createElement("div")

    d.textContent = str
    return d.innerHTML
}

function escAttr(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
