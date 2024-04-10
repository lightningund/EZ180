struct VertexOut {
	@builtin(position) position : vec4f
}

@vertex
fn vertex_main(@location(0) position: vec4f) -> VertexOut {
	var output : VertexOut;
	output.position = position;
	return output;
}

@fragment
fn fragment_main(frag_data: VertexOut) -> @location(0) vec4f {
	return frag_data.position;
}