var _zoomT = null;
var _zoomTree = null;
var _zoomForest = null;
var _resizeHandler = null;
var _lastViewMode = null;
var _initialized = false;
var _stableWeights = {};
var _stableWedges = [];

var _NODE_R = { dir: 12, file: 7 };

function resetVisualCache() {
    _initialized = false;
    _stableWeights = {};
    _stableWedges = [];
}

function initStableLayout(nodes) {
    if (_initialized || !nodes || !nodes.length) {
        return;
    }

    _initialized = true;

    // Sort first-level children: dirs first (by name), then files (by name)

    var dirs = [];
    var files = [];

    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].type === "dir") {
            dirs.push(nodes[i]);
        } else {
            files.push(nodes[i]);
        }
    }

    dirs.sort(function(a, b) { return a.name.localeCompare(b.name); });
    files.sort(function(a, b) { return a.name.localeCompare(b.name); });

    // Rebuild in sorted order

    nodes.length = 0;

    for (var di = 0; di < dirs.length; di++) { nodes.push(dirs[di]); }
    for (var fi = 0; fi < files.length; fi++) { nodes.push(files[fi]); }

    function computeWeight(n) {
        var w = 1;

        if (n.children && n.children.length) {
            var childDirs = [];
            var childFiles = [];

            for (var ci = 0; ci < n.children.length; ci++) {
                if (n.children[ci].type === "dir") {
                    childDirs.push(n.children[ci]);
                } else {
                    childFiles.push(n.children[ci]);
                }
            }

            childDirs.sort(function(a, b) { return a.name.localeCompare(b.name); });
            childFiles.sort(function(a, b) { return a.name.localeCompare(b.name); });

            n.children = childDirs.concat(childFiles);

            for (var ci = 0; ci < n.children.length; ci++) {
                w += computeWeight(n.children[ci]);
            }
        }

        _stableWeights[n.path] = w;
        return w;
    }

    for (var ni = 0; ni < nodes.length; ni++) {
        computeWeight(nodes[ni]);
    }

    // Compute wedges for first-level children (compressed by sqrt to prevent domination)

    var sqrtTotal = 0;

    for (var i = 0; i < nodes.length; i++) {
        sqrtTotal += Math.sqrt(_stableWeights[nodes[i].path] || 1);
    }

    var cum = 0;

    for (var i = 0; i < nodes.length; i++) {
        var prop = Math.sqrt(_stableWeights[nodes[i].path] || 1) / sqrtTotal;

        _stableWedges.push({
            startAngle: cum * 2 * Math.PI,
            endAngle: (cum + prop) * 2 * Math.PI,
            centerAngle: (cum + prop / 2) * 2 * Math.PI,
        });
        cum += prop;
    }
}

function placeChildrenStable(wNodes, startAngle, endAngle, depth, dStep) {
    if (!wNodes || !wNodes.length) {
        return;
    }

    var totalWeight = 0;

    for (var i = 0; i < wNodes.length; i++) {
        totalWeight += _stableWeights[wNodes[i].data.path] || 1;
    }

    var range = endAngle - startAngle;
    var cum = startAngle;
    var adjusted = [];

    for (var i = 0; i < wNodes.length; i++) {
        var n = wNodes[i];
        var w = (_stableWeights[n.data.path] || 1) / totalWeight;
        var midAngle = cum + range * w / 2;
        adjusted.push({ node: n, angle: midAngle });
        cum += range * w;
    }

    // Enforce minimum angular gap so circles never overlap

    var r = depth * dStep;

    if (r > 0 && adjusted.length > 1) {
        for (var pass = 0; pass < 5; pass++) {
            var moved = false;

            for (var i = 1; i < adjusted.length; i++) {
                var cr = _NODE_R[adjusted[i].node.data.type] || 7;
                var pr = _NODE_R[adjusted[i - 1].node.data.type] || 7;
                var minGap = (cr + pr + 4) / r;
                var gap = adjusted[i].angle - adjusted[i - 1].angle;

                if (gap < minGap) {
                    adjusted[i].angle = adjusted[i - 1].angle + minGap;
                    moved = true;
                }
            }

            if (!moved) { break; }
        }

        // Compress back into wedge if overflow

        var lastAngle = adjusted[adjusted.length - 1].angle;

        if (lastAngle > endAngle) {
            var scale = (endAngle - startAngle) / (lastAngle - startAngle);

            for (var i = 0; i < adjusted.length; i++) {
                adjusted[i].angle = startAngle + (adjusted[i].angle - startAngle) * scale;
            }
        }
    }

    for (var i = 0; i < adjusted.length; i++) {
        adjusted[i].node._x = adjusted[i].angle;
        adjusted[i].node._y = depth * dStep;

        var child = adjusted[i].node;

        if (child.children && child.children.length) {
            var childStart = i === 0 ? startAngle : (adjusted[i - 1].angle + adjusted[i].angle) / 2;
            var childEnd = i === adjusted.length - 1 ? endAngle : (adjusted[i].angle + adjusted[i + 1].angle) / 2;
            placeChildrenStable(child.children, childStart, childEnd, depth + 1, dStep);
        }
    }
}

function adjustRadiusToFitLabels(root, maxDepth, svgW, svgH) {
    var radius = Math.min(svgW, svgH) / 2 - 10;

    for (var iter = 0; iter < 5; iter++) {
        var dStep = radius / Math.max(maxDepth, 1);
        if (dStep < 40) { dStep = 40; }

        var labelWidths = {};

        root.each(function(d) {
            if (d.depth === 0) { return; }
            if (!labelWidths[d.depth]) { labelWidths[d.depth] = 0; }
            labelWidths[d.depth] += (d.data.name || "").length * 7 + 10;
        });

        var circleDiameters = {};

        root.each(function(d) {
            if (d.depth === 0) { return; }
            if (!circleDiameters[d.depth]) { circleDiameters[d.depth] = 0; }
            circleDiameters[d.depth] += d.data.type === "dir" ? 24 : 14;
        });

        var needsMore = false;

        for (var dep = 1; dep <= maxDepth; dep++) {
            var r = dep * dStep;
            var circumference = 2 * Math.PI * r;
            var needed = labelWidths[dep] || 0;

            if (needed > circumference * 0.5) {
                needsMore = true;
                break;
            }

            if ((circleDiameters[dep] || 0) > circumference) {
                needsMore = true;
                break;
            }
        }

        if (!needsMore) { break; }
        radius = radius * 1.3;
    }

    return Math.max(radius, maxDepth * 45);
}

function computeVisibleLabels(root, depthStep) {
    var visible = {};
    var byDepth = {};

    root.each(function(d) {
        if (d.depth === 0) { return; }
        if (!byDepth[d.depth]) { byDepth[d.depth] = []; }
        byDepth[d.depth].push(d);
    });

    for (var dep in byDepth) {
        var nodes = byDepth[dep];
        nodes.sort(function(a, b) { return a.x - b.x; });

        var r = parseInt(dep) * depthStep;
        if (r < 1) {
            for (var ni = 0; ni < nodes.length; ni++) { visible[nodes[ni].data.path] = true; }
            continue;
        }

        var circumference = 2 * Math.PI * r;
        var totalWidth = 0;

        for (var ni = 0; ni < nodes.length; ni++) {
            totalWidth += (nodes[ni].data.name || "").length * 7 + 16;
        }

        if (totalWidth <= circumference) {
            for (var ni = 0; ni < nodes.length; ni++) { visible[nodes[ni].data.path] = true; }
        } else {
            var maxFit = Math.floor(circumference / 50);
            if (maxFit < 1) { maxFit = 1; }
            var step = Math.ceil(nodes.length / maxFit);

            for (var ni = 0; ni < nodes.length; ni += step) {
                visible[nodes[ni].data.path] = true;
            }
        }
    }

    return visible;
}

function renderVisualTree(selector, nodes, expandedPaths, onToggle, toolMode, selectedPaths, groups, onToggleSelect, viewMode) {
    var svgEl = document.querySelector(selector);

    if (!svgEl) {
        return;
    }

    if (_lastViewMode !== viewMode) {
        if (_lastViewMode === "1") {
            _zoomTree = _zoomT;
        } else if (_lastViewMode === "2") {
            _zoomForest = _zoomT;
        }
        _zoomT = viewMode === "1" ? _zoomTree : _zoomForest;
        _lastViewMode = viewMode;
    }

    d3.select(svgEl).on(".zoom", null);
    delete svgEl.__zoom;
    svgEl.innerHTML = "";
    if (!nodes || !nodes.length) {
        return;
    }

    // Initialize stable layout BEFORE filter so root.children order matches _stableWedges

    initStableLayout(nodes);

    function filter(nodes) {
        var out = [];

        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var expand = expandedPaths[n.path];
            var children = [];

            if (n.children && n.children.length) {
                children = expand ? filter(n.children) : [];
            }

            out.push({ name: n.name, path: n.path, type: n.type, children: children });
        }

        return out;
    }

    var rootData = {
        name: "/",
        path: "",
        type: "dir",
        children: filter(nodes),
    };

    var root = d3.hierarchy(rootData);

    if (!root.children || root.children.length === 0) {
        return;
    }

    var parent = svgEl.parentElement;

    if (!parent) {
        return;
    }

    var svgW = parent.clientWidth || 600;
    var svgH = parent.clientHeight || 400;

    var maxDepth = 0;

    root.eachBefore(function(d) {
        if (d.depth > maxDepth) { maxDepth = d.depth; }
    });

    var radius = adjustRadiusToFitLabels(root, maxDepth, svgW, svgH);
    var depthStep = Math.max(radius / Math.max(maxDepth, 1), 55);

    if (depthStep < 10) {
        return;
    }

    // Position first-level children at fixed wedge centers

    for (var i = 0; i < root.children.length; i++) {
        var child = root.children[i];
        var wedge = _stableWedges[i];

        if (wedge) {
            child._x = wedge.centerAngle;
            child._y = depthStep;

            if (child.children && child.children.length) {
                placeChildrenStable(
                    child.children,
                    wedge.startAngle, wedge.endAngle,
                    2, depthStep
                );
            }
        } else {
            child._x = (i / root.children.length) * 2 * Math.PI;
            child._y = depthStep;
        }
    }

    // Set root position (center)

    root._x = 0;
    root._y = 0;

    // Copy custom positions to D3's x/y for project() and link/label rendering

    root.each(function(d) {
        if (d._x != null) {
            d.x = d._x;
            d.y = d._y;
        } else {
            d.x = 0;
            d.y = 0;
        }
    });

    var visibleLabels = computeVisibleLabels(root, depthStep);

    function project(d) {
        var r = d.y || 0;
        var a = (d.x || 0) - Math.PI / 2;
        return [r * Math.cos(a), r * Math.sin(a)];
    }

    var selectMode = toolMode === "select";
    var pathColor = {};

    groups && groups.forEach(function(g) {
        g.paths && g.paths.forEach(function(p) {
            pathColor[p] = g.color;
        });
    });

    var svg = d3.select(selector)
        .attr("width", svgW)
        .attr("height", svgH);

    if (_resizeHandler) {
        window.removeEventListener("resize", _resizeHandler);
    }

    _resizeHandler = function() {
        if (!svgEl || !svgEl.parentElement) {
            return;
        }
        var w = svgEl.parentElement.clientWidth;
        var h = svgEl.parentElement.clientHeight;
        if (w < 10 || h < 10) {
            return;
        }
        if (w === svgW && h === svgH) {
            return;
        }
        renderVisualTree(selector, nodes, expandedPaths, onToggle, toolMode, selectedPaths, groups, onToggleSelect, viewMode);
    };

    window.addEventListener("resize", _resizeHandler);

    if (viewMode === "2") {
        if (groups && groups.length) {
            renderForest(svg, groups, nodes, svgW, svgH, toolMode, selectedPaths, onToggleSelect, svgEl, parent);
            return;
        }

        svg.append("text")
            .attr("x", svgW / 2)
            .attr("y", svgH / 2)
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .attr("fill", "var(--text-secondary)")
            .attr("font-size", "14px")
            .text("No groups to display");
        return;
    }

    var g = svg.append("g");

    g.selectAll(".tree-link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("class", "tree-link")
        .attr("d", function(d) {
            var s = project(d.source);
            var t = project(d.target);
            var mx = (s[0] + t[0]) / 2;
            var my = (s[1] + t[1]) / 2;
            return "M" + s[0] + "," + s[1] + "Q" + mx + "," + my + " " + t[0] + "," + t[1];
        });

    var node = g.selectAll(".tree-visual-node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", "tree-visual-node")
        .attr("transform", function(d) {
            var p = project(d);
            return "translate(" + p[0] + "," + p[1] + ")";
        });

    var circle = node.append("circle");

    circle.attr("r", function(d) { return _NODE_R[d.data.type] || 7; });

    circle.attr("class", function(d) {
        var cls = d.data.type === "dir" ? "tree-node-dir" : "tree-node-file";

        if (selectedPaths && selectedPaths[d.data.path]) {
            cls += " tree-node--selected";
        }

        return cls;
    });

    circle.style("fill", function(d) {
        var c = pathColor[d.data.path];

        return c || null;
    });

    node.append("text")
        .attr("class", "tree-visual-label")
        .attr("dy", 4)
        .attr("dx", function(d) {
            var p = project(d);
            return p[0] >= 0 ? 16 : -16;
        })
        .attr("text-anchor", function(d) {
            var p = project(d);
            return p[0] >= 0 ? "start" : "end";
        })
        .text(function(d) {
            if (!visibleLabels[d.data.path]) { return ""; }
            var name = d.data.name;
            return name.length > 15 ? name.substring(0, 12) + "..." : name;
        });

    node.append("title")
        .text(function(d) {
            return d.data.path || d.data.name;
        });

    if (selectMode) {
        parent.classList.add("tree-visual--select");
        node.style("cursor", "pointer");

        node.on("click", function(event, d) {
            event.stopPropagation();

            if (onToggleSelect) { onToggleSelect(d.data.path); }
        });

        svg.on("click", function() {
            if (onToggleSelect) { onToggleSelect(null); }
        });
    } else {
        parent.classList.remove("tree-visual--select");

        node.each(function(d) {
            var el = d3.select(this);

            if (d.data.type === "dir") {
                el.style("cursor", "pointer");
            }
        });

        node.on("click", function(event, d) {
            event.stopPropagation();

            if (d.data.type === "dir" && onToggle) {
                onToggle(d.data.path);
            }
        });

        svg.on("click", null);
    }

    var initT;

    if (_zoomT) {
        initT = d3.zoomIdentity
            .scale(_zoomT.k)
            .translate(_zoomT.x / _zoomT.k, _zoomT.y / _zoomT.k);
    } else {
        var minPx = Infinity, maxPx = -Infinity, minPy = Infinity, maxPy = -Infinity;

        root.each(function(d) {
            var p = project(d);
            if (p[0] < minPx) { minPx = p[0]; }
            if (p[0] > maxPx) { maxPx = p[0]; }
            if (p[1] < minPy) { minPy = p[1]; }
            if (p[1] > maxPy) { maxPy = p[1]; }
        });

        var treeW = maxPx - minPx;
        var treeH = maxPy - minPy;
        var centerX = (minPx + maxPx) / 2;
        var centerY = (minPy + maxPy) / 2;
        var fitScale = Math.min(
            svgW / (treeW + 40),
            svgH / (treeH + 40),
            1.5
        );

        var fitTx = svgW / 2 - centerX * fitScale;
        var fitTy = svgH / 2 - centerY * fitScale;
        initT = d3.zoomIdentity
            .translate(fitTx / fitScale, fitTy / fitScale)
            .scale(fitScale);

        _zoomT = { x: initT.x, y: initT.y, k: initT.k };
    }

    g.attr("transform", initT);

    var zoom = d3.zoom()
        .scaleExtent([0.1, 5])
        .filter(function() {
            return !selectMode;
        })
        .on("zoom", function(event) {
            g.attr("transform", event.transform);
            _zoomT = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
        });

    svg.call(zoom);
    svg.node().__zoom = initT;
    svg.on("dblclick.zoom", null);
}

function buildPathLookup(nodes) {
    var lookup = {};

    function walk(list) {
        for (var i = 0; i < list.length; i++) {
            lookup[list[i].path] = list[i].type || "dir";
            if (list[i].children) { walk(list[i].children); }
        }
    }

    walk(nodes);
    return lookup;
}

function buildGroupTree(paths, typeLookup) {
    var realPaths = {};

    for (var pi = 0; pi < paths.length; pi++) {
        realPaths[paths[pi]] = true;
    }

    var root = { name: "", path: "", type: "dir", children: [], _real: false, _map: {} };

    paths.forEach(function(path) {
        var parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
        var current = root;

        parts.forEach(function(part, i) {
            var childPath = parts.slice(0, i + 1).join("/");
            var existing = current._map[part];

            if (!existing) {
                var type = typeLookup[childPath] || "dir";

                existing = {
                    name: part,
                    path: childPath,
                    type: type,
                    children: [],
                    _map: {},
                    _real: !!realPaths[childPath],
                };
                current.children.push(existing);
                current._map[part] = existing;
            } else {
                if (realPaths[childPath]) {
                    existing._real = true;
                }
            }

            current = existing;
        });
    });

    return root;
}

function renderForest(svg, groups, allNodes, svgW, svgH, toolMode, selectedPaths, onToggleSelect, svgEl, parent) {
    if (!groups || !groups.length) {
        return;
    }

    var selectMode = toolMode === "select";
    var typeLookup = buildPathLookup(allNodes);
    var cx = svgW / 2;
    var cy = svgH / 2;
    var space = Math.min(svgW, svgH);
    var orbitR = space * 0.18;
    var maxTreeR = space * 0.28;

    var g = svg.append("g");

    for (var gi = 0; gi < groups.length; gi++) {
        var group = groups[gi];
        var rootData = buildGroupTree(group.paths, typeLookup);

        if (!rootData.children || !rootData.children.length) {
            continue;
        }

        var root = d3.hierarchy(rootData);

        if (!root.children || !root.children.length) {
            continue;
        }

        var leafCount = 0;

        root.eachAfter(function(d) {
            d._leafCount = d.children
                ? d.children.reduce(function(s, c) { return s + c._leafCount; }, 0)
                : 1;
        });

        leafCount = root._leafCount;
        var maxDepth = 0;

        root.eachBefore(function(d) {
            if (d.depth > maxDepth) { maxDepth = d.depth; }
        });

        var angle = (gi / groups.length) * 2 * Math.PI - Math.PI / 2;
        var wedge = (2 * Math.PI / groups.length) * 0.7;
        var anglePerLeaf = wedge / Math.max(leafCount, 1);
        var depthStep = Math.max(maxTreeR / Math.max(maxDepth, 1), 18);

        var tree = d3.tree()
            .nodeSize([anglePerLeaf, depthStep])
            .separation(function(a, b) {
                return (a.parent === b.parent ? 1 : 2);
            });

        tree(root);

        var groupG = g.append("g");

        function project(d) {
            var r = orbitR + d.y;
            var a = angle + d.x;
            return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
        }

        groupG.selectAll(".forest-link")
            .data(root.links())
            .enter()
            .append("path")
            .attr("class", "forest-link")
            .attr("d", function(d) {
                var s = project(d.source);
                var t = project(d.target);
                return "M" + s[0] + "," + s[1] + "L" + t[0] + "," + t[1];
            })
            .attr("stroke", function(d) {
                return d.target.data._real ? group.color : null;
            })
            .attr("stroke-opacity", function(d) {
                return d.target.data._real ? 0.45 : null;
            });

        var nodes = root.descendants();

        var circles = groupG.selectAll(".forest-node")
            .data(nodes.filter(function(d) { return d.depth > 0; }))
            .enter()
            .append("circle")
            .attr("class", function(d) {
                var cls = "forest-node";

                if (!d.data._real) {
                    cls += " forest-node--default";
                }

                if (selectedPaths && selectedPaths[d.data.path]) {
                    cls += " forest-node--selected";
                }

                return cls;
            })
            .attr("transform", function(d) {
                var p = project(d);
                return "translate(" + p[0] + "," + p[1] + ")";
            })
            .attr("r", function(d) {
                return d.data.type === "dir" ? 5 : 3;
            })
            .attr("fill", function(d) {
                return d.data._real ? group.color : null;
            })
            .attr("fill-opacity", function(d) {
                return d.data._real ? 0.7 : null;
            })
            .attr("stroke", function(d) {
                return d.data._real ? group.color : null;
            })
            .attr("stroke-width", function(d) {
                return d.data._real ? 0.5 : null;
            })
            .attr("stroke-opacity", function(d) {
                return d.data._real ? 0.3 : null;
            });

        if (selectMode) {
            circles.style("cursor", "pointer");

            circles.on("click", function(event, d) {
                event.stopPropagation();
                if (onToggleSelect) { onToggleSelect(d.data.path); }
            });
        }

        var gx = cx + orbitR * Math.cos(angle);
        var gy = cy + orbitR * Math.sin(angle);

        groupG.selectAll(".forest-label")
            .data(nodes.filter(function(d) { return d.depth > 0; }))
            .enter()
            .append("text")
            .attr("class", "forest-label")
            .attr("transform", function(d) {
                var p = project(d);
                return "translate(" + p[0] + "," + p[1] + ")";
            })
            .attr("dy", -6)
            .attr("dx", function(d) {
                var p = project(d);
                return p[0] >= cx ? 7 : -7;
            })
            .attr("text-anchor", function(d) {
                var p = project(d);
                return p[0] >= cx ? "start" : "end";
            })
            .text(function(d) {
                return d.data.name.length > 12
                    ? d.data.name.substring(0, 10) + "\u2026"
                    : d.data.name;
            });

        groupG.append("text")
            .attr("class", "forest-group-label")
            .attr("x", gx)
            .attr("y", gy)
            .attr("dy", 4)
            .attr("text-anchor", "middle")
            .attr("fill", group.color)
            .attr("font-size", 11)
            .attr("font-weight", 700)
            .text(group.name);
    }

    if (selectMode) {
        parent.classList.add("tree-visual--select");
        svg.on("click", function() {
            if (onToggleSelect) { onToggleSelect(null); }
        });
    } else {
        parent.classList.remove("tree-visual--select");
        svg.on("click", null);
    }

    var initT;

    if (_zoomT) {
        initT = d3.zoomIdentity
            .scale(_zoomT.k)
            .translate(_zoomT.x / _zoomT.k, _zoomT.y / _zoomT.k);
    } else {
        initT = d3.zoomIdentity;
        _zoomT = { x: 0, y: 0, k: 1 };
    }

    g.attr("transform", initT);

    var zoom = d3.zoom()
        .scaleExtent([0.1, 5])
        .filter(function() {
            return !selectMode;
        })
        .on("zoom", function(event) {
            g.attr("transform", event.transform);
            _zoomT = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
        });

    svg.call(zoom);
    svg.node().__zoom = initT;
    svg.on("dblclick.zoom", null);
}
