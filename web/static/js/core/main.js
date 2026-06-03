document.addEventListener("alpine:init", () => {
    Alpine.data("app", () => ({
        // Variables -------------------------------------------------------

        // Theme

        theme: localStorage.getItem("theme") || "dark",

        // Groups

        groups: [],

        groupName: "",
        groupColorIndex: 0,

        _dragIndex: null,
        _dragOverIndex: null,

        // Workspace

        scanned: false,
        loading: false,

        workspacePath: "",
        projectName: "",

        treeData: [],
        stats: null,

        expandedPaths: {},
        _pathType: {},
        chartRendered: false,

        // Navigation

        activeTab: "stats",

        // Tree View

        viewMode: "1",

        // Tests

        testTarget: "all",
        testResults: null,
        testRunning: false,

        // Selection

        selectedPaths: {},
        toolMode: "pan",
        selectMode: "normal",

        // Methods ---------------------------------------------------------

        // Init

        init() {
            this.applyTheme();
        },

        // Theme

        applyTheme() {
            document.documentElement.classList.toggle(
                "light", this.theme === "light"
            );
        },

        toggleTheme() {
            this.theme = this.theme === "dark" ? "light" : "dark";

            localStorage.setItem("theme", this.theme);

            this.applyTheme();
        },

        // Groups

        saveGroups() {
            if (!this.workspacePath) {
                return;
            }

            API.post("/api/project/config", {
                path: this.workspacePath,
                data: { groups: this.groups },
            }).catch(err => {
                console.error("Failed to save config:", err);
            });
        },

        loadProjectConfig(path) {
            return API.get("/api/project/config?path=" + encodeURIComponent(path)).then(config => {
                if (config && config.groups) {
                    config.groups.forEach(g => {
                        if (g.paths) {
                            g.paths = g.paths.map(p => p.replace(/\\/g, "/"));
                        }
                    });

                    this.groups = config.groups.filter(g => g.paths && g.paths.length);
                }
            }).catch(() => {
                // Config file doesn't exist yet — start with empty groups
            });
        },

        createGroup() {
            const name = this.groupName.trim();

            if (!name) {
                return;
            }

            const selected = Object.keys(this.selectedPaths);

            if (!selected.length) {
                return;
            }

            const color = this._nextGroupColor();

            let newPaths;

            switch (this.selectMode) {
                case "asc":
                    newPaths = this._collectAncestors(selected);
                    break;
                case "desc":
                    newPaths = this._collectDescendants(selected, this.treeData);
                    break;
                default:
                    newPaths = selected.slice();
            }

            let existing = null;
            let existingIndex = -1;

            for (let i = 0; i < this.groups.length; i++) {
                if (this.groups[i].name === name) {
                    existing = this.groups[i];
                    existingIndex = i;
                    break;
                }
            }

            const clean = [];
            const newPathsSet = {};

            for (let i = 0; i < newPaths.length; i++) {
                newPathsSet[newPaths[i]] = true;
            }

            for (let i = 0; i < this.groups.length; i++) {
                const g = this.groups[i];

                if (i === existingIndex) {
                    continue;
                }

                const filtered = [];

                for (let j = 0; j < g.paths.length; j++) {
                    if (!newPathsSet[g.paths[j]]) {
                        filtered.push(g.paths[j]);
                    }
                }

                if (filtered.length) {
                    clean.push({
                        name: g.name,
                        paths: filtered,
                        color: g.color,
                    });
                }
            }

            clean.push({
                name: name,
                paths: newPaths,
                color: existing ? existing.color : color,
            });

            this.groups = clean;
            this.groupName = "";
            this.selectedPaths = {};

            this.saveGroups();
            this.renderTreeView();
        },

        renameGroup(oldName, newName) {
            newName = newName.trim();

            if (!newName || newName === oldName) {
                return;
            }
            if (this.groups.some(g => g.name === newName)) {
                return;
            }

            let group = null;

            for (let i = 0; i < this.groups.length; i++) {
                if (this.groups[i].name === oldName) {
                    group = this.groups[i];
                    break;
                }
            }

            if (!group) {
                return;
            }

            group.name = newName;

            this.saveGroups();
            this.renderTreeView();
        },

        setGroupColor(name, color) {
            let group = null;

            for (let i = 0; i < this.groups.length; i++) {
                if (this.groups[i].name === name) {
                    group = this.groups[i];
                    break;
                }
            }

            if (!group) {
                return;
            }

            group.color = color;

            this.saveGroups();
            this.renderTreeView();
        },

        removePath(groupName, path) {
            let group = null;

            for (let i = 0; i < this.groups.length; i++) {
                if (this.groups[i].name === groupName) {
                    group = this.groups[i];
                    break;
                }
            }

            if (!group) {
                return;
            }

            const filtered = [];

            for (let i = 0; i < group.paths.length; i++) {
                if (group.paths[i] !== path) {
                    filtered.push(group.paths[i]);
                }
            }

            if (filtered.length) {
                group.paths = filtered;
            } else {
                this.groups = this.groups.filter(g => g.name !== groupName);
            }

            this.saveGroups();
            this.renderTreeView();
        },

        deleteGroup(name) {
            this.groups = this.groups.filter(g => g.name !== name);

            this.saveGroups();
            this.renderTreeView();
        },

        onDragStart(index, event) {
            this._dragIndex = index;

            event.dataTransfer.effectAllowed = "move";
        },

        onDrop(index) {
            if (this._dragIndex === null || this._dragIndex === index) {
                this._dragIndex = null;
                return;
            }

            const groups = this.groups.slice();

            const item = groups.splice(this._dragIndex, 1)[0];
            const target = index;

            groups.splice(target, 0, item);

            this.groups = groups;
            this._dragIndex = null;

            this.saveGroups();
            this.renderTreeView();
        },

        onDragEnd() {
            this._dragIndex = null;
        },

        groupStats(g) {
            let files = 0, dirs = 0;

            for (let i = 0; i < g.paths.length; i++) {
                if (this._pathType[g.paths[i]] === "dir") {
                    dirs++;
                } else {
                    files++;
                }
            }

            const parts = [];

            if (files) {
                parts.push(files + " file" + (files !== 1 ? "s" : ""));
            }
            if (dirs) {
                parts.push(dirs + " dir" + (dirs !== 1 ? "s" : ""));
            }

            return parts.length ? parts.join(", ") : "0 items";
        },

        // Workspace

        async scanWorkspace() {
            const path = this.workspacePath.trim();

            if (!path) {
                return;
            }

            this.loading = true;
            this.testResults = null;
            this.groups = [];

            try {
                const data = await API.post("/api/scan", { path: path });

                this.projectName = data.name || (path.split(/[/\\]/).filter(Boolean).pop()) || path;
                this.treeData = data.tree || [];
                this.stats = data.stats || null;
                this.expandedPaths = {};
                this._pathType = {};

                const normalizePaths = nodes => {
                    for (let i = 0; i < nodes.length; i++) {
                        nodes[i].path = nodes[i].path.replace(/\\/g, "/");

                        this._pathType[nodes[i].path] = nodes[i].type;

                        if (nodes[i].children && nodes[i].children.length) {
                            normalizePaths(nodes[i].children);
                        }
                    }
                };

                normalizePaths(this.treeData);

                resetVisualCache();

                this.chartRendered = false;
                this.scanned = true;
                this.activeTab = "stats";

                await this.loadProjectConfig(path);

                this.$nextTick(() => {
                    renderSidebarTree(
                        "tree-container", this.treeData, this.expandedPaths,
                        p => { this.toggleExpand(p); },
                        this.groups
                    );
                    this.renderActiveView();
                });
            } catch (err) {
                console.error("Scan failed:", err);
            } finally {
                this.loading = false;
            }
        },

        // Navigation

        switchTab(tab) {
            this.activeTab = tab;

            this.$nextTick(() => { this.renderActiveView(); });
        },

        renderActiveView() {
            switch (this.activeTab) {
                case "tree":
                    this.renderTreeView();
                    break;
                case "stats":
                    this.renderChart();
                    break;
            }
        },

        // Chart

        renderChart() {
            if (this.chartRendered || !this.stats || !this.stats.languages || !this.stats.languages.length) {
                return;
            }

            if (typeof renderLanguageChart === "function") {
                renderLanguageChart(this.stats.languages, "#lang-chart");
            }

            this.chartRendered = true;
        },

        // Tree View

        renderTreeView() {
            renderSidebarTree(
                "tree-container", this.treeData, this.expandedPaths,
                p => { this.toggleExpand(p); },
                this.groups
            );

            renderVisualTree(
                "#tree-svg", this.treeData, this.expandedPaths,
                p => { this.toggleExpand(p); },
                this.toolMode, this.selectedPaths, this.groups,
                p => { this.toggleSelect(p); },
                this.viewMode
            );
        },

        toggleExpand(path) {
            this.expandedPaths[path] = !this.expandedPaths[path];

            renderSidebarTree(
                "tree-container", this.treeData, this.expandedPaths,
                p => { this.toggleExpand(p); },
                this.groups
            );

            if (this.activeTab === "tree") {
                renderVisualTree(
                    "#tree-svg", this.treeData, this.expandedPaths,
                    p => { this.toggleExpand(p); },
                    this.toolMode, this.selectedPaths, this.groups,
                    p => { this.toggleSelect(p); },
                    this.viewMode
                );
            }
        },

        // Tests

        async runTests() {
            if (!this.scanned || this.testRunning) {
                return;
            }

            this.testRunning = true;
            this.testResults = null;

            try {
                const data = await API.post("/api/tests/run", {
                    path: this.workspacePath,
                    target: this.testTarget,
                });

                this.testResults = data;
            } catch (err) {
                console.error("Tests failed:", err);
            } finally {
                this.testRunning = false;
            }
        },

        // Selection

        selectedCount() {
            return Object.keys(this.selectedPaths).length;
        },

        switchToolMode(mode) {
            this.toolMode = mode;
            this.renderTreeView();
        },

        toggleSelect(path) {
            if (path === null) {
                this.selectedPaths = {};
            } else {
                const key = path.replace(/\\/g, "/");

                this.selectedPaths[key] = !this.selectedPaths[key];

                if (!this.selectedPaths[key]) {
                    delete this.selectedPaths[key];
                }
            }

            this.renderTreeView();
        },

        // Private

        _collectAncestors(paths) {
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
        },

        _collectDescendants(paths, nodes) {
            const result = {};
            const pathToNode = {};

            const buildLookup = nodes => {
                for (let i = 0; i < nodes.length; i++) {
                    pathToNode[nodes[i].path] = nodes[i];

                    if (nodes[i].children) {
                        buildLookup(nodes[i].children);
                    }
                }
            };

            buildLookup(nodes);

            for (let i = 0; i < paths.length; i++) {
                result[paths[i]] = true;

                const node = pathToNode[paths[i]];

                if (node && node.children) {
                    this._walkDescendants(node.children, result);
                }
            }

            return Object.keys(result);
        },

        _walkDescendants(nodes, result) {
            for (let i = 0; i < nodes.length; i++) {
                result[nodes[i].path] = true;

                if (nodes[i].children) {
                    this._walkDescendants(nodes[i].children, result);
                }
            }
        },

        _nextGroupColor() {
            const hue = (this.groupColorIndex * 137.508) % 360;

            this.groupColorIndex++;

            return "hsl(" + hue + ", 70%, 55%)";
        },
    }));
});