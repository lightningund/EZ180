// Testing for and setting up WebGPU
if (!navigator.gpu) throw Error("WebGPU not supported");
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw Error("Couldn't request WebGPU Adapter");
const device = await adapter.requestDevice();
if (!device) throw Error("Couldn't request WebGPU Device");

const format = navigator.gpu.getPreferredCanvasFormat();

const shader_mod = device.createShaderModule({ code: shaders });

const pipeline_desc = {
	vertex: {
		module: shader_mod,
		entryPoint: "vertex_main"
	},
	fragment: {
		module: shader_mod,
		entryPoint: "fragment_main",
		targets: [{ format }]
	},
	primitive: {
		topology: "triangle-strip"
	},
	layout: "auto"
};

const render_pipeline = device.createRenderPipeline(pipeline_desc);

const sampler = device.createSampler();

const uniform_buffer = device.createBuffer({
	size: 4 * (1 + 1 + 2),
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const bind_group = device.createBindGroup({
	layout: render_pipeline.getBindGroupLayout(0),
	entries: [
		{ binding: 0, resource: sampler },
		{ binding: 1, resource: { buffer: uniform_buffer } }
	]
});

/** @type {HTMLCanvasElement} */
const canv = document.getElementById("smooshed");

/** @type {RenderingContext} */
const ctxt = canv.getContext("webgpu");

// Tell the canvas context about it
ctxt.configure({ device, format });

// The following code is inspired heavily by the input code from SauceNAO
const quick_check_url = str => (/^((http|https|data):)/).test(str);

function smoosh(img_dat) {
	const texture = device.createTexture({
		size: [img_dat.width, img_dat.height],
		format: "rgba8unorm",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
	});

	device.queue.writeTexture(
		{ texture },
		img_dat.data,
		{ bytesPerRow: img_dat.width * 4 },
		{ width: img_dat.width, height: img_dat.height }
	);

	// Figure out a way to adjust HFoV outside the code
	const uniform_vals = new Float32Array([
		(img_dat.height / img_dat.width), // Ratio
		90 * Math.PI / 180, // HFoV
		canv.width, canv.height // Canvas width and height
	]);

	const bind_group2 = device.createBindGroup({
		layout: render_pipeline.getBindGroupLayout(1),
		entries: [
			{ binding: 0, resource: texture.createView() },
		]
	});

	//---------
	// Drawing
	//---------
	const render_pass_desc = {
		colorAttachments: [
			{
				clearValue: { r: 0, g: 0.5, b: 1, a: 1 },
				loadOp: "clear",
				storeOp: "store",
				view: ctxt.getCurrentTexture().createView()
			}
		]
	};

	const cmd_encoder = device.createCommandEncoder();
	const pass_enc = cmd_encoder.beginRenderPass(render_pass_desc);

	pass_enc.setPipeline(render_pipeline);
	pass_enc.setBindGroup(0, bind_group);
	pass_enc.setBindGroup(1, bind_group2);

	device.queue.writeBuffer(uniform_buffer, 0, uniform_vals);

	pass_enc.draw(4);

	pass_enc.end();

	device.queue.submit([cmd_encoder.finish()]);

	// Save image
	let image = document.createElement("a");
	image.href = canv.toDataURL();
	image.download = "image.png";
	image.click();
}

/**
 * Takes an image as a data URL and converts it into image data
 * @param {string} url
 * @returns {Promise<ImageData>}
 */
const url_to_data = (url) =>
	new Promise((res, rej) => {
		const img = document.createElement("img");

		img.onload = function () {
			console.log(this.width, this.height);
			const local_canv = document.createElement("canvas");
			local_canv.width = this.width;
			local_canv.height = this.height;
			const local_ctxt = local_canv.getContext("2d");
			local_ctxt.drawImage(img, 0, 0);
			document.body.appendChild(local_canv);

			res(local_ctxt.getImageData(0, 0, this.width, this.height));
		}

		img.src = url;
	});

async function showImageURL(url) {
	if (!quick_check_url(url)) throw Error("Invalid Image");

	const img_dat = await url_to_data(url);
	console.log(img_dat);

	smoosh(img_dat);
}

function showImageFile(fileInput) {
	let fr = new FileReader();

	fr.onload = function() {
		let dataURL = fr.result;
		showImageURL(dataURL);
	}

	fr.readAsDataURL(fileInput.files[0]);
}

file_input.onchange = function() { check_img_file(this); }

function check_img_file(file_input_elem) {
	let img_display = document.getElementById("imagePreview");
	let search_button = document.getElementById("searchButton");
	let file_MB = file_input_elem.files[0].size / 1024 / 1024;
	let filename = file_input_elem.value.trim().toLowerCase();
	let type_regex = new RegExp("\.(png|jpe?g|gif|bmp|webp)$");
	let max_filesize = parseInt((localStorage.getItem("fsizeMax"))) | 15; // Default to 15

	if (file_MB > max_filesize) {
		// too big
		img_display.innerHTML = "<span class='previewErrorText'>Image Too Large!</span>";
		file_input_elem.value = ""; // clear file input
		search_button.classList.remove("searchButtonActive"); // darken search button
		searchReady = false;
	} else if (!(type_regex.test(filename))) {
		// bad filetype - should pull type list from db
		img_display.innerHTML = "<span class='previewErrorText'>Image Type Not Supported!</span>";
		file_input_elem.value = ""; // clear file input
		search_button.classList.remove("searchButtonActive"); // darken search button
		searchReady = false;
	} else {
		// good - clear the url input and submit if auto
		showImageFile(file_input_elem); // display new image and activate search button
	}
}

document.onpaste = function(event) {
	event.preventDefault();
	let clipboard_data = (event.clipboardData || event.originalEvent.clipboardData);
	if (clipboard_data.files[0] == undefined) return;

	file_input.files = clipboard_data.files;
	check_img_file(file_input);
}