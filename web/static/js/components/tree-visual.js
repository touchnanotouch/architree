var _zoomT = null
var _resizeHandler = null

function renderVisualTree(selector, nodes, expandedPaths, onToggle, toolMode, selectedPaths, groups, onToggleSelect) {
    var svgEl = document.querySelector(selector)

    if (!svgEl) return

    d3.select(svgEl).on(".zoom", null)
    svgEl.innerHTML = ""
    if (!nodes || !nodes.length) return

    function filter(nodes) {
        var out = []

        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i]
            var expand = expandedPaths && expandedPaths[n.path]
            var children = []

            if (n.children && n.children.length) {
                children = expand ? filter(n.children) : []
            }

            out.push({ name: n.name, path: n.path, type: n.type, children: children })
        }

        return out
    }

    var rootData = {
        name: "/",
        path: "",
        type: "dir",
        children: filter(nodes),
    }

    var root = d3.hierarchy(rootData)

    if (!root.children || root.children.length === 0) return

    var parent = svgEl.parentElement

    if (!parent) return

    var svgW = parent.clientWidth || 600
    var svgH = parent.clientHeight || 400

    root.eachAfter(function(d) {
        d._leafCount = d.children
            ? d.children.reduce(function(s, c) { return s + c._leafCount }, 0)
            : 1
    })

    function distributeBySize(nodes) {
        var sorted = nodes.slice().sort(function(a, b) {
            return a._leafCount - b._leafCount
        })

        var result = []
        var i = 0, j = sorted.length - 1

        while (i <= j) {
            if (i === j) {
                result.push(sorted[i])
                i++
            } else {
                result.push(sorted[i])
                i++
                result.push(sorted[j])
                j--
            }
        }

        return result
    }

    root.children = distributeBySize(root.children)

    var totalLeaves = root._leafCount
    var maxDepth = 0

    root.eachBefore(function(d) {
        if (d.depth > maxDepth) maxDepth = d.depth
    })

    var baseRadius = Math.min(svgW, svgH) / 2 - 10
    var minRadius = 70 * totalLeaves / (2 * Math.PI)
    var radius = Math.max(baseRadius, minRadius, maxDepth * 60)

    if (radius < 10) return

    var depthStep = Math.max(radius / Math.max(maxDepth, 1), 55)
    var anglePerLeaf = 2 * Math.PI / Math.max(totalLeaves, 1)

    var tree = d3.tree()
        .nodeSize([anglePerLeaf, depthStep])
        .separation(function(a, b) {
            return (a.parent === b.parent ? 1 : 2)
        })

    tree(root)

    root.eachBefore(function(d) {
        var dRadius = d.depth * depthStep
        var ancestorExtra = d.parent ? d.parent._cumExtra : 0
        var ownExtra = 0

        if (d.data.type === "dir" && d.children && d.children.length > 3) {
            ownExtra = Math.min(d.children.length * 4, 36)
        }

        d._cumExtra = ancestorExtra + ownExtra
        d.y = dRadius + d._cumExtra
    })

    function project(d) {
        var r = d.y
        var a = d.x - Math.PI / 2
        return [r * Math.cos(a), r * Math.sin(a)]
    }

    var selectMode = toolMode === "select"
    var pathColor = {}

    groups && groups.forEach(function(g) {
        g.paths && g.paths.forEach(function(p) {
            pathColor[p] = g.color
        })
    })

    var svg = d3.select(selector)
        .attr("width", svgW)
        .attr("height", svgH)

    var g = svg.append("g")

    g.selectAll(".tree-link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("class", "tree-link")
        .attr("d", function(d) {
            var s = project(d.source)
            var t = project(d.target)
            return "M" + s[0] + "," + s[1] + "L" + t[0] + "," + t[1]
        })

    var node = g.selectAll(".tree-visual-node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", "tree-visual-node")
        .attr("transform", function(d) {
            var p = project(d)
            return "translate(" + p[0] + "," + p[1] + ")"
        })

    var circle = node.append("circle")

    circle.attr("r", function(d) { return d.data.type === "dir" ? 12 : 7 })

    circle.attr("class", function(d) {
        var cls = d.data.type === "dir" ? "tree-node-dir" : "tree-node-file"

        if (selectedPaths && selectedPaths[d.data.path]) {
            cls += " tree-node--selected"
        }

        return cls
    })

    circle.style("fill", function(d) {
        var c = pathColor[d.data.path]

        return c || null
    })

    node.append("text")
        .attr("class", "tree-visual-label")
        .attr("dy", 4)
        .attr("dx", function(d) {
            var p = project(d)
            return p[0] >= 0 ? 16 : -16
        })
        .attr("text-anchor", function(d) {
            var p = project(d)
            return p[0] >= 0 ? "start" : "end"
        })
        .text(function(d) {
            var name = d.data.name
            return name.length > 15 ? name.substring(0, 12) + "..." : name
        })

    if (selectMode) {
        parent.classList.add("tree-visual--select")
        node.style("cursor", "pointer")

        node.on("click", function(event, d) {
            event.stopPropagation()

            if (onToggleSelect) onToggleSelect(d.data.path)
        })

        svg.on("click", function() {
            if (onToggleSelect) onToggleSelect(null)
        })
    } else {
        parent.classList.remove("tree-visual--select")
        node.on("click", null)
        svg.on("click", null)
    }

    var initT

    if (_zoomT) {
        initT = d3.zoomIdentity
            .scale(_zoomT.k)
            .translate(_zoomT.x / _zoomT.k, _zoomT.y / _zoomT.k)
    } else {
        var minPx = Infinity, maxPx = -Infinity, minPy = Infinity, maxPy = -Infinity

        root.each(function(d) {
            var p = project(d)
            if (p[0] < minPx) minPx = p[0]
            if (p[0] > maxPx) maxPx = p[0]
            if (p[1] < minPy) minPy = p[1]
            if (p[1] > maxPy) maxPy = p[1]
        })

        var treeW = maxPx - minPx
        var treeH = maxPy - minPy
        var centerX = (minPx + maxPx) / 2
        var centerY = (minPy + maxPy) / 2
        var fitScale = Math.min(
            svgW / (treeW + 40),
            svgH / (treeH + 40),
            1.5
        )

        var fitTx = svgW / 2 - centerX * fitScale
        var fitTy = svgH / 2 - centerY * fitScale
        initT = d3.zoomIdentity
            .translate(fitTx / fitScale, fitTy / fitScale)
            .scale(fitScale)
    }

    g.attr("transform", initT)

    var zoom = d3.zoom()
        .scaleExtent([0.1, 5])
        .filter(function() {
            return !selectMode
        })
        .on("zoom", function(event) {
            g.attr("transform", event.transform)
            _zoomT = { x: event.transform.x, y: event.transform.y, k: event.transform.k }
        })

    svg.call(zoom)
    svg.node().__zoom = initT

    if (_resizeHandler) {
        window.removeEventListener("resize", _resizeHandler)
    }

    _resizeHandler = function() {
        if (!svgEl || !svgEl.parentElement) return
        var w = svgEl.parentElement.clientWidth
        var h = svgEl.parentElement.clientHeight
        if (w < 10 || h < 10) return
        if (w === svgW && h === svgH) return
        renderVisualTree(selector, nodes, expandedPaths, onToggle, toolMode, selectedPaths, groups, onToggleSelect)
    }

    window.addEventListener("resize", _resizeHandler)
}
