const shaders = `
const PI = radians(180.0);

struct Settings {
	ratio: f32,
	hfov: f32,
	canv: vec2f
};

@group(0) @binding(0) var our_sampler: sampler;
@group(0) @binding(1) var<uniform> settings: Settings;
@group(0) @binding(2) var tex: texture_external;
// The texture is in a different group because the other two can be bound ahead of time

const quad_verts = array(vec2f(-1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(1, -1));

// +Z is from the camera to the image plane
// +Y is from the camera directly up
// +X is from the camera directly right

@vertex
fn vertex_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
	return vec4f(quad_verts[i], 0, 1);
}

fn within(val: f32, lim: f32) -> bool {
	return val < lim && val > -lim;
}

fn map(value: f32, min1: f32, max1: f32, min2: f32, max2: f32) -> f32 {
	return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

fn ll_to_cart(lon: f32, lat: f32) -> vec3f {
	var x = cos(lat) * cos(lon);
	var y = cos(lat) * sin(lon);
	var z = sin(lat);
	return vec3f(y, z, x);
}

@fragment
fn fragment_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
	// Normalized pixel coordinates (from 0 to 1)
	var uv = position.xy / settings.canv;

	var width = 2.0 * sin(settings.hfov / 2.0);
	var height = width * settings.ratio;

	var h = width / tan(settings.hfov / 2.0) / 2.0;

	var lon = map(uv.x, 0.0, 1.0, -PI / 2.0, PI / 2.0);
	var lat = map(uv.y, 0.0, 1.0, -PI / 2.0, PI / 2.0);

	var world = ll_to_cart(lon, lat);
	var plane = world.xy / world.z * h;

	var x = map(plane.x, -width / 2.0, width / 2.0, 0.0, 1.0);
	var y = map(plane.y, -height / 2.0, height / 2.0, 0.0, 1.0);
	var sampled = textureSampleBaseClampToEdge(tex, our_sampler, vec2f(x, y));

	if (within(plane.x, width / 2.0) && within(plane.y, height / 2.0)) {
		return vec4f(sampled.xyz, 1);
	} else {
		return vec4f(0, 0, 0, 1);
	}
}
`;