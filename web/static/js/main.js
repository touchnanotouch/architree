var GROUP_COLORS = [
    "#3fb950", "#d29922", "#f85149", "#bc8cff",
    "#79c0ff", "#ff7b72", "#7ee787", "#e3b341",
]

document.addEventListener("alpine:init", function() {
    Alpine.data("app", function() {
        return {
            theme: localStorage.getItem("theme") || "dark",
            scanned: false,
            loading: false,
            workspacePath: "",
            projectName: "",
            activeTab: "tree",
            treeData: [],
            stats: null,
            expandedPaths: {},
            testTarget: "all",
            testResults: null,
            testRunning: false,
            chartRendered: false,

            groups: [],
            selectedPaths: {},
            toolMode: "pan",
            groupName: "",
            groupColorIndex: 0,

            init: function() {
                this.applyTheme()
                this.loadGroups()
            },

            toggleTheme: function() {
                this.theme = this.theme === "dark" ? "light" : "dark"

                localStorage.setItem("theme", this.theme)

                this.applyTheme()
            },

            applyTheme: function() {
                document.documentElement.classList.toggle("light", this.theme === "light")
            },

            saveGroups: function() {
                localStorage.setItem("architree_groups", JSON.stringify(this.groups))
            },

            loadGroups: function() {
                var saved = localStorage.getItem("architree_groups")

                if (saved) {
                    try {
                        this.groups = JSON.parse(saved)
                        this.groups = this.groups.filter(function(g) { return g.paths && g.paths.length })
                        this.groupColorIndex = this.groups.length
                    } catch (e) {
                        console.error("Failed to load groups:", e)
                    }
                }
            },

            scanWorkspace: async function() {
                var path = this.workspacePath.trim()

                if (!path) {
                    return
                }

                this.loading = true
                this.testResults = null

                try {
                    var data = await API.post("/api/scan", { path: path })

                    this.projectName = data.name || (path.split(/[/\\]/).filter(Boolean).pop()) || path
                    this.treeData = data.tree || []
                    this.stats = data.stats || null
                    this.expandedPaths = {}
                    this._pathType = {}

                    function buildPathMap(nodes) {
                        for (var i = 0; i < nodes.length; i++) {
                            this._pathType[nodes[i].path] = nodes[i].type

                            if (nodes[i].children && nodes[i].children.length) {
                                buildPathMap.call(this, nodes[i].children)
                            }
                        }
                    }

                    buildPathMap.call(this, this.treeData)

                    this.chartRendered = false
                    this.scanned = true
                    this.activeTab = "tree"

                    var self = this

                    this.$nextTick(function() { self.renderTreeView() })
                } catch (err) {
                    console.error("Scan failed:", err)
                } finally {
                    this.loading = false
                }
            },

            switchTab: function(tab) {
                this.activeTab = tab

                var self = this

                this.$nextTick(function() { self.renderActiveView() })
            },

            renderActiveView: function() {
                switch (this.activeTab) {
                    case "tree":
                        this.renderTreeView()
                        break
                    case "stats":
                        this.renderChart()
                        break
                }
            },

            renderTreeView: function() {
                var self = this

                renderSidebarTree(
                    "tree-container", this.treeData, this.expandedPaths,
                    function(p) { self.toggleExpand(p) },
                    this.groups
                )

                renderVisualTree(
                    "#tree-svg", this.treeData, this.expandedPaths,
                    function(p) { self.toggleExpand(p) },
                    this.toolMode, this.selectedPaths, this.groups,
                    function(p) { self.toggleSelect(p) }
                )
            },

            toggleExpand: function(path) {
                this.expandedPaths[path] = !this.expandedPaths[path]

                var self = this

                renderSidebarTree(
                    "tree-container", this.treeData, this.expandedPaths,
                    function(p) { self.toggleExpand(p) },
                    this.groups
                )

                if (this.activeTab === "tree") {
                    renderVisualTree(
                        "#tree-svg", this.treeData, this.expandedPaths,
                        function(p) { self.toggleExpand(p) },
                        this.toolMode, this.selectedPaths, this.groups,
                        function(p) { self.toggleSelect(p) }
                    )
                }
            },

            renderChart: function() {
                if (this.chartRendered || !this.stats || !this.stats.languages || !this.stats.languages.length) {
                    return
                }

                if (typeof renderLanguageChart === "function") {
                    renderLanguageChart(this.stats.languages, "#lang-chart")
                }

                this.chartRendered = true
            },

            runTests: async function() {
                if (!this.scanned || this.testRunning) {
                    return
                }

                this.testRunning = true
                this.testResults = null

                try {
                    var data = await API.post("/api/tests/run", {
                        path: this.workspacePath,
                        target: this.testTarget,
                    })

                    this.testResults = data
                } catch (err) {
                    console.error("Tests failed:", err)
                } finally {
                    this.testRunning = false
                }
            },

            switchToolMode: function(mode) {
                this.toolMode = mode
                this.renderTreeView()
            },

            toggleSelect: function(path) {
                if (path === null) {
                    this.selectedPaths = {}
                } else {
                    this.selectedPaths[path] = !this.selectedPaths[path]

                    if (!this.selectedPaths[path]) {
                        delete this.selectedPaths[path]
                    }
                }

                this.renderTreeView()
            },

            createGroup: function() {
                var name = this.groupName.trim()

                if (!name) return

                var selected = Object.keys(this.selectedPaths)

                if (!selected.length) return

                var color = GROUP_COLORS[this.groupColorIndex % GROUP_COLORS.length]

                this.groupColorIndex++

                var newPaths = selected.slice()

                var existing = null
                var existingIndex = -1

                for (var i = 0; i < this.groups.length; i++) {
                    if (this.groups[i].name === name) {
                        existing = this.groups[i]
                        existingIndex = i
                        break
                    }
                }

                var clean = []

                for (var i = 0; i < this.groups.length; i++) {
                    var g = this.groups[i]

                    if (i === existingIndex) continue

                    var filtered = []

                    for (var j = 0; j < g.paths.length; j++) {
                        if (newPaths.indexOf(g.paths[j]) === -1) {
                            filtered.push(g.paths[j])
                        }
                    }

                    if (filtered.length) {
                        clean.push({
                            name: g.name,
                            paths: filtered,
                            color: g.color,
                        })
                    }
                }

                clean.push({
                    name: name,
                    paths: newPaths,
                    color: existing ? existing.color : color,
                })

                this.groups = clean
                this.groupName = ""
                this.selectedPaths = {}
                this.saveGroups()
                this.renderTreeView()
            },

            renameGroup: function(oldName, newName) {
                newName = newName.trim()

                if (!newName || newName === oldName) return
                if (this.groups.some(function(g) { return g.name === newName })) return

                var group = null

                for (var i = 0; i < this.groups.length; i++) {
                    if (this.groups[i].name === oldName) {
                        group = this.groups[i]
                        break
                    }
                }

                if (!group) return

                group.name = newName
                this.saveGroups()
                this.renderTreeView()
            },

            setGroupColor: function(name, color) {
                var group = null

                for (var i = 0; i < this.groups.length; i++) {
                    if (this.groups[i].name === name) {
                        group = this.groups[i]
                        break
                    }
                }

                if (!group) return

                group.color = color
                this.saveGroups()
                this.renderTreeView()
            },

            removePath: function(groupName, path) {
                var group = null

                for (var i = 0; i < this.groups.length; i++) {
                    if (this.groups[i].name === groupName) {
                        group = this.groups[i]
                        break
                    }
                }

                if (!group) return

                var filtered = []

                for (var i = 0; i < group.paths.length; i++) {
                    if (group.paths[i] !== path) {
                        filtered.push(group.paths[i])
                    }
                }

                if (filtered.length) {
                    group.paths = filtered
                } else {
                    this.groups = this.groups.filter(function(g) { return g.name !== groupName })
                }

                this.saveGroups()
                this.renderTreeView()
            },

            deleteGroup: function(name) {
                this.groups = this.groups.filter(function(g) { return g.name !== name })
                this.saveGroups()
                this.renderTreeView()
            },

            groupStats: function(g) {
                var files = 0, dirs = 0

                for (var i = 0; i < g.paths.length; i++) {
                    if (this._pathType && this._pathType[g.paths[i]] === "dir") {
                        dirs++
                    } else {
                        files++
                    }
                }

                var parts = []

                if (files) parts.push(files + " file" + (files !== 1 ? "s" : ""))
                if (dirs) parts.push(dirs + " dir" + (dirs !== 1 ? "s" : ""))

                return parts.length ? parts.join(", ") : "0 items"
            },

            selectedCount: function() {
                return Object.keys(this.selectedPaths).length
            },
        }
    })
})
