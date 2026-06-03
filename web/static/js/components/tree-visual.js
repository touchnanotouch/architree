let _zoomT = null;
let _zoomTree = null;
let _zoomForest = null;
let _resizeHandler = null;
let _lastViewMode = null;
let _initialized = false;
let _stableWeights = {};
let _stableWedges = [];

const _NODE_R = { dir: 12, file: 7 };

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

    let dirs = [];
    let files = [];

    for (let i = 0; i < nodes.length; i++) {
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

    for (let di = 0; di < dirs.length; di++) { nodes.push(dirs[di]); }
    for (let fi = 0; fi < files.length; fi++) { nodes.push(files[fi]); }

    function computeWeight(n) {
        let w = 1;

        if (n.children && n.children.length) {
            let childDirs = [];
            let childFiles = [];

            for (let ci = 0; ci < n.children.length; ci++) {
                if (n.children[ci].type === "dir") {
                    childDirs.push(n.children[ci]);
                } else {
                    childFiles.push(n.children[ci]);
                }
            }

            childDirs.sort(function(a, b) { return a.name.localeCompare(b.name); });
            childFiles.sort(function(a, b) { return a.name.localeCompare(b.name); });

            n.children = childDirs.concat(childFiles);

            for (let ci = 0; ci < n.children.length; ci++) {
                w += computeWeight(n.children[ci]);
            }
        }

        _stableWeights[n.path] = w;
        return w;
    }

    for (let ni = 0; ni < nodes.length; ni++) {
        computeWeight(nodes[ni]);
    }

    // Compute wedges for first-level children (compressed by sqrt to prevent domination)

    let sqrtTotal = 0;

    for (let i = 0; i < nodes.length; i++) {
        sqrtTotal += Math.sqrt(_stableWeights[nodes[i].path] || 1);
    }

    let cum = 0;

    for (let i = 0; i < nodes.length; i++) {
        let prop = Math.sqrt(_stableWeights[nodes[i].path] || 1) / sqrtTotal;

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

    let totalWeight = 0;

    for (let i = 0; i < wNodes.length; i++) {
        totalWeight += _stableWeights[wNodes[i].data.path] || 1;
    }

    let range = endAngle - startAngle;
    let cum = startAngle;
    let adjusted = [];

    for (let i = 0; i < wNodes.length; i++) {
        let n = wNodes[i];
        let w = (_stableWeights[n.data.path] || 1) / totalWeight;
        let midAngle = cum + range * w / 2;
        adjusted.push({ node: n, angle: midAngle });
        cum += range * w;
    }

    // Enforce minimum angular gap so circles never overlap

    let r = depth * dStep;

    if (r > 0 && adjusted.length > 1) {
        for (let pass = 0; pass < 5; pass++) {
            let moved = false;

            for (let i = 1; i < adjusted.length; i++) {
                let cr = _NODE_R[adjusted[i].node.data.type] || 7;
                let pr = _NODE_R[adjusted[i - 1].node.data.type] || 7;
                let minGap = (cr + pr + 4) / r;
                let gap = adjusted[i].angle - adjusted[i - 1].angle;

                if (gap < minGap) {
                    adjusted[i].angle = adjusted[i - 1].angle + minGap;
                    moved = true;
                }
            }

            if (!moved) { break; }
        }

        // Compress back into wedge if overflow

        let lastAngle = adjusted[adjusted.length - 1].angle;

        if (lastAngle > endAngle) {
            let scale = (endAngle - startAngle) / (lastAngle - startAngle);

            for (let i = 0; i < adjusted.length; i++) {
                adjusted[i].angle = startAngle + (adjusted[i].angle - startAngle) * scale;
            }
        }
    }

    for (let i = 0; i < adjusted.length; i++) {
        adjusted[i].node._x = adjusted[i].angle;
        adjusted[i].node._y = depth * dStep;

        let child = adjusted[i].node;

        if (child.children && child.children.length) {
            let childStart = i === 0 ? startAngle : (adjusted[i - 1].angle + adjusted[i].angle) / 2;
            let childEnd = i === adjusted.length - 1 ? endAngle : (adjusted[i].angle + adjusted[i + 1].angle) / 2;
            placeChildrenStable(child.children, childStart, childEnd, depth + 1, dStep);
        }
    }
}

function adjustRadiusToFitLabels(root, maxDepth, svgW, svgH) {
    let radius = Math.min(svgW, svgH) / 2 - 10;

    for (let iter = 0; iter < 5; iter++) {
        let dStep = radius / Math.max(maxDepth, 1);
        if (dStep < 40) { dStep = 40; }

        let labelWidths = {};

        root.each(function(d) {
            if (d.depth === 0) { return; }
            if (!labelWidths[d.depth]) { labelWidths[d.depth] = 0; }
            labelWidths[d.depth] += (d.data.name || "").length * 7 + 10;
        });

        let circleDiameters = {};

        root.each(function(d) {
            if (d.depth === 0) { return; }
            if (!circleDiameters[d.depth]) { circleDiameters[d.depth] = 0; }
            circleDiameters[d.depth] += d.data.type === "dir" ? 24 : 14;
        });

        let needsMore = false;

        for (let dep = 1; dep <= maxDepth; dep++) {
            let r = dep * dStep;
            let circumference = 2 * Math.PI * r;
            let needed = labelWidths[dep] || 0;

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
    let visible = {};
    let byDepth = {};

    root.each(function(d) {
        if (d.depth === 0) { return; }
        if (!byDepth[d.depth]) { byDepth[d.depth] = []; }
        byDepth[d.depth].push(d);
    });

    for (let dep in byDepth) {
        let nodes = byDepth[dep];
        nodes.sort(function(a, b) { return a.x - b.x; });

        let r = parseInt(dep) * depthStep;
        if (r < 1) {
            for (let ni = 0; ni < nodes.length; ni++) { visible[nodes[ni].data.path] = true; }
            continue;
        }

        let circumference = 2 * Math.PI * r;
        let totalWidth = 0;

        for (let ni = 0; ni < nodes.length; ni++) {
            totalWidth += (nodes[ni].data.name || "").length * 7 + 16;
        }

        if (totalWidth <= circumference) {
            for (let ni = 0; ni < nodes.length; ni++) { visible[nodes[ni].data.path] = true; }
        } else {
            let maxFit = Math.floor(circumference / 50);
            if (maxFit < 1) { maxFit = 1; }
            let step = Math.ceil(nodes.length / maxFit);

            for (let ni = 0; ni < nodes.length; ni += step) {
                visible[nodes[ni].data.path] = true;
            }
        }
    }

    return visible;
}

function renderVisualTree(selector, nodes, expandedPaths, onToggle, toolMode, selectedPaths, groups, onToggleSelect, viewMode) {
    let svgEl = document.querySelector(selector);

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
        let out = [];

        for (let i = 0; i < nodes.length; i++) {
            let n = nodes[i];
            let expand = expandedPaths[n.path];
            let children = [];

            if (n.children && n.children.length) {
                children = expand ? filter(n.children) : [];
            }

            out.push({ name: n.name, path: n.path, type: n.type, children: children });
        }

        return out;
    }

    let rootData = {
        name: "/",
        path: "",
        type: "dir",
        children: filter(nodes),
    };

    let root = d3.hierarchy(rootData);

    if (!root.children || root.children.length === 0) {
        return;
    }

    let parent = svgEl.parentElement;

    if (!parent) {
        return;
    }

    let svgW = parent.clientWidth || 600;
    let svgH = parent.clientHeight || 400;

    let maxDepth = 0;

    root.eachBefore(function(d) {
        if (d.depth > maxDepth) { maxDepth = d.depth; }
    });

    let radius = adjustRadiusToFitLabels(root, maxDepth, svgW, svgH);
    let depthStep = Math.max(radius / Math.max(maxDepth, 1), 55);

    if (depthStep < 10) {
        return;
    }

    // Position first-level children at fixed wedge centers

    for (let i = 0; i < root.children.length; i++) {
        let child = root.children[i];
        let wedge = _stableWedges[i];

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

    let visibleLabels = computeVisibleLabels(root, depthStep);

    function project(d) {
        let r = d.y || 0;
        let a = (d.x || 0) - Math.PI / 2;
        return [r * Math.cos(a), r * Math.sin(a)];
    }

    let selectMode = toolMode === "select";
    let pathColor = {};

    groups && groups.forEach(function(g) {
        g.paths && g.paths.forEach(function(p) {
            pathColor[p] = g.color;
        });
    });

    let svg = d3.select(selector)
        .attr("width", svgW)
        .attr("height", svgH);

    if (_resizeHandler) {
        window.removeEventListener("resize", _resizeHandler);
    }

    _resizeHandler = function() {
        if (!svgEl || !svgEl.parentElement) {
            return;
        }
        let w = svgEl.parentElement.clientWidth;
        let h = svgEl.parentElement.clientHeight;
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

    let g = svg.append("g");

    g.selectAll(".tree-link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("class", "tree-link")
        .attr("d", d => {
            let s = project(d.source);
            let t = project(d.target);
            let mx = (s[0] + t[0]) / 2;
            let my = (s[1] + t[1]) / 2;
            return "M" + s[0] + "," + s[1] + "Q" + mx + "," + my + " " + t[0] + "," + t[1];
        });

    let node = g.selectAll(".tree-visual-node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", "tree-visual-node")
        .attr("transform", d => {
            let p = project(d);
            return "translate(" + p[0] + "," + p[1] + ")";
        });

    let circle = node.append("circle");

    circle.attr("r", d => _NODE_R[d.data.type] || 7);

    circle.attr("class", d => {
        let cls = d.data.type === "dir" ? "tree-node-dir" : "tree-node-file";

        if (selectedPaths && selectedPaths[d.data.path]) {
            cls += " tree-node--selected";
        }

        return cls;
    });

    circle.style("fill", d => {
        let c = pathColor[d.data.path];

        return c || null;
    });

    node.append("text")
        .attr("class", "tree-visual-label")
        .attr("dy", 4)
        .attr("dx", d => {
            let p = project(d);
            return p[0] >= 0 ? 16 : -16;
        })
        .attr("text-anchor", d => {
            let p = project(d);
            return p[0] >= 0 ? "start" : "end";
        })
        .text(d => {
            if (!visibleLabels[d.data.path]) { return ""; }
            let name = d.data.name;
            return name.length > 15 ? name.substring(0, 12) + "..." : name;
        });

    node.append("title")
        .text(d => d.data.path || d.data.name);

    if (selectMode) {
        parent.classList.add("tree-visual--select");
        node.style("cursor", "pointer");

        node.on("click", (event, d) => {
            event.stopPropagation();

            if (onToggleSelect) { onToggleSelect(d.data.path); }
        });

        svg.on("click", () => {
            if (onToggleSelect) { onToggleSelect(null); }
        });
    } else {
        parent.classList.remove("tree-visual--select");

        node.each(function(d) {
            let el = d3.select(this);

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

    let initT;

    if (_zoomT) {
        initT = d3.zoomIdentity
            .scale(_zoomT.k)
            .translate(_zoomT.x / _zoomT.k, _zoomT.y / _zoomT.k);
    } else {
        let minPx = Infinity, maxPx = -Infinity, minPy = Infinity, maxPy = -Infinity;

        root.each(function(d) {
            let p = project(d);
            if (p[0] < minPx) { minPx = p[0]; }
            if (p[0] > maxPx) { maxPx = p[0]; }
            if (p[1] < minPy) { minPy = p[1]; }
            if (p[1] > maxPy) { maxPy = p[1]; }
        });

        let treeW = maxPx - minPx;
        let treeH = maxPy - minPy;
        let centerX = (minPx + maxPx) / 2;
        let centerY = (minPy + maxPy) / 2;
        let fitScale = Math.min(
            svgW / (treeW + 40),
            svgH / (treeH + 40),
            1.5
        );

        let fitTx = svgW / 2 - centerX * fitScale;
        let fitTy = svgH / 2 - centerY * fitScale;
        initT = d3.zoomIdentity
            .translate(fitTx / fitScale, fitTy / fitScale)
            .scale(fitScale);

        _zoomT = { x: initT.x, y: initT.y, k: initT.k };
    }

    g.attr("transform", initT);

    let zoom = d3.zoom()
        .scaleExtent([0.1, 5])
        .filter(() => !selectMode)
        .on("zoom", event => {
            g.attr("transform", event.transform);
            _zoomT = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
        });

    svg.call(zoom);
    svg.node().__zoom = initT;
    svg.on("dblclick.zoom", null);
}

function buildPathLookup(nodes) {
    let lookup = {};

    function walk(list) {
        for (let i = 0; i < list.length; i++) {
            lookup[list[i].path] = list[i].type || "dir";
            if (list[i].children) { walk(list[i].children); }
        }
    }

    walk(nodes);
    return lookup;
}

function buildGroupTree(paths, typeLookup) {
    let realPaths = {};

    for (let pi = 0; pi < paths.length; pi++) {
        realPaths[paths[pi]] = true;
    }

    let root = { name: "", path: "", type: "dir", children: [], _real: false, _map: {} };

    paths.forEach(function(path) {
        let parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
        let current = root;

        parts.forEach(function(part, i) {
            let childPath = parts.slice(0, i + 1).join("/");
            let existing = current._map[part];

            if (!existing) {
                let type = typeLookup[childPath] || "dir";

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

    let selectMode = toolMode === "select";
    let typeLookup = buildPathLookup(allNodes);
    let cx = svgW / 2;
    let cy = svgH / 2;
    let space = Math.min(svgW, svgH);
    let orbitR = space * 0.18;
    let maxTreeR = space * 0.28;

    let g = svg.append("g");

    for (let gi = 0; gi < groups.length; gi++) {
        let group = groups[gi];
        let rootData = buildGroupTree(group.paths, typeLookup);

        if (!rootData.children || !rootData.children.length) {
            continue;
        }

        let root = d3.hierarchy(rootData);

        if (!root.children || !root.children.length) {
            continue;
        }

        let leafCount = 0;

        root.eachAfter(function(d) {
            d._leafCount = d.children
                ? d.children.reduce(function(s, c) { return s + c._leafCount; }, 0)
                : 1;
        });

        leafCount = root._leafCount;
        let maxDepth = 0;

        root.eachBefore(function(d) {
            if (d.depth > maxDepth) { maxDepth = d.depth; }
        });

        let angle = (gi / groups.length) * 2 * Math.PI - Math.PI / 2;
        let wedge = (2 * Math.PI / groups.length) * 0.7;
        let anglePerLeaf = wedge / Math.max(leafCount, 1);
        let depthStep = Math.max(maxTreeR / Math.max(maxDepth, 1), 18);

        let tree = d3.tree()
            .nodeSize([anglePerLeaf, depthStep])
            .separation(function(a, b) {
                return (a.parent === b.parent ? 1 : 2);
            });

        tree(root);

        let groupG = g.append("g");

        function project(d) {
            let r = orbitR + d.y;
            let a = angle + d.x;
            return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
        }

        groupG.selectAll(".forest-link")
            .data(root.links())
            .enter()
            .append("path")
            .attr("class", "forest-link")
            .attr("d", d => {
                let s = project(d.source);
                let t = project(d.target);
                return "M" + s[0] + "," + s[1] + "L" + t[0] + "," + t[1];
            })
            .attr("stroke", d => d.target.data._real ? group.color : null)
            .attr("stroke-opacity", d => d.target.data._real ? 0.45 : null);

        let nodes = root.descendants();

        let circles = groupG.selectAll(".forest-node")
            .data(nodes.filter(d => d.depth > 0))
            .enter()
            .append("circle")
            .attr("class", d => {
                let cls = "forest-node";

                if (!d.data._real) {
                    cls += " forest-node--default";
                }

                if (selectedPaths && selectedPaths[d.data.path]) {
                    cls += " forest-node--selected";
                }

                return cls;
            })
            .attr("transform", d => {
                let p = project(d);
                return "translate(" + p[0] + "," + p[1] + ")";
            })
            .attr("r", d => d.data.type === "dir" ? 5 : 3)
            .attr("fill", d => d.data._real ? group.color : null)
            .attr("fill-opacity", d => d.data._real ? 0.7 : null)
            .attr("stroke", d => d.data._real ? group.color : null)
            .attr("stroke-width", d => d.data._real ? 0.5 : null)
            .attr("stroke-opacity", d => d.data._real ? 0.3 : null);

        if (selectMode) {
            circles.style("cursor", "pointer");

            circles.on("click", (event, d) => {
                event.stopPropagation();
                if (onToggleSelect) { onToggleSelect(d.data.path); }
            });
        }

        let gx = cx + orbitR * Math.cos(angle);
        let gy = cy + orbitR * Math.sin(angle);

        groupG.selectAll(".forest-label")
            .data(nodes.filter(d => d.depth > 0))
            .enter()
            .append("text")
            .attr("class", "forest-label")
            .attr("transform", d => {
                let p = project(d);
                return "translate(" + p[0] + "," + p[1] + ")";
            })
            .attr("dy", -6)
            .attr("dx", d => {
                let p = project(d);
                return p[0] >= cx ? 7 : -7;
            })
            .attr("text-anchor", d => {
                let p = project(d);
                return p[0] >= cx ? "start" : "end";
            })
            .text(d => {
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
            .attr("font-size", "11px")
            .attr("font-weight", 700)
            .text(group.name);
    }

    if (selectMode) {
        parent.classList.add("tree-visual--select");
        svg.on("click", () => {
            if (onToggleSelect) { onToggleSelect(null); }
        });
    } else {
        parent.classList.remove("tree-visual--select");
        svg.on("click", null);
    }

    let initT;

    if (_zoomT) {
        initT = d3.zoomIdentity
            .scale(_zoomT.k)
            .translate(_zoomT.x / _zoomT.k, _zoomT.y / _zoomT.k);
    } else {
        initT = d3.zoomIdentity;
        _zoomT = { x: 0, y: 0, k: 1 };
    }

    g.attr("transform", initT);

    let zoom = d3.zoom()
        .scaleExtent([0.1, 5])
        .filter(() => !selectMode)
        .on("zoom", event => {
            g.attr("transform", event.transform);
            _zoomT = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
        });

    svg.call(zoom);
    svg.node().__zoom = initT;
    svg.on("dblclick.zoom", null);
}
