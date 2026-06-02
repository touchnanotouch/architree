function renderLanguageChart(data, selector) {
    var el = document.querySelector(selector)

    if (!el || typeof d3 === "undefined") return

    var width = el.clientWidth
    var height = 300
    var radius = Math.min(width, height) / 2 * 0.8

    d3.select(el).selectAll("svg").remove()

    var svg = d3.select(el)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", "translate(" + (width / 2) + ", " + (height / 2) + ")")

    var color = d3.scaleOrdinal(d3.schemeSet2)
    var pie = d3.pie().value(function(d) { return d.value })
    var arc = d3.arc().innerRadius(radius * 0.4).outerRadius(radius)
    var outerArc = d3.arc().innerRadius(radius * 0.5).outerRadius(radius * 0.6)

    var arcs = svg.selectAll(".arc")
        .data(pie(data))
        .enter().append("g")
        .attr("class", "arc")

    arcs.append("path")
        .attr("d", arc)
        .attr("fill", function(d) { return color(d.data.label) })
        .attr("stroke", "var(--bg)")
        .attr("stroke-width", 2)
}
