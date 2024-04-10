const shaders = document.getElementById("shaders").textContent;

const canv = document.getElementById("smooshed");
const ctxt = canv.getContext("webgpu");

async function initGPU() {
	if (!navigator.gpu) throw Error("WebGPU not supported");

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) throw Error("Couldn't request WebGPU Adapter");

	const device = await adapter.requestDevice();
	if (!device) throw Error("Couldn't request WebGPU Device");

	const shader_mod = device.createShaderModule({ code: shaders });

	ctxt.configure({
		device: device,
		format: navigator.gpu.getPreferredCanvasFormat(),
		alphaMode: "premultiplied"
	});

	const verts = new Float32Array([
		0, 0, 0, 0,
		0, 1, 0, 0,
		1, 1, 0, 0,
		1, 0, 0, 0
	]);

	const vertex_buffer = device.createBuffer({
		size: verts.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
	});

	device.queue.writeBuffer(vertex_buffer, 0, verts, 0, verts.length);

	const vertex_buffers = [
		{
			attributes: [
				{
					shaderLocation: 0, // position
					offset: 0,
					format: "float32x4"
				}
			],
			arrayStride: 16,
			stepMode: "vertex"
		}
	];

	const pipeline_desc = {
		vertex: {
			module: shader_mod,
			entryPoint: "vertex_main",
			buffers: vertex_buffers
		},
		fragment: {
			module: shader_mod,
			entryPoint: "fragment_main",
			targets: [
				{ format: navigator.gpu.getPreferredCanvasFormat() }
			]
		},
		primitive: { topology: "triangle-strip" },
		layout: "auto"
	};

	const render_pipeline = device.createRenderPipeline(pipeline_desc);

	const cmd_encoder = device.createCommandEncoder();

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

	const pass_enc = cmd_encoder.beginRenderPass(render_pass_desc);

	pass_enc.setPipeline(render_pipeline);
	pass_enc.setVertexBuffer(0, vertex_buffer);
	pass_enc.draw(3);

	pass_enc.end();

	device.queue.submit([cmd_encoder.finish()]);
}

initGPU();

// Vast majority of the following code is inspired heavily by the input code from SauceNAO
const quick_check_url = str => (/^((http|https|data):)/).test(str);

function showImageURL(url) {
	let imageDisplay = document.getElementById("imagePreview");

	if (quick_check_url(url)) {
		imageDisplay.innerHTML = `<div style="width: 100%; height: 100%;"><img src="${url}" onerror="imageURLError();"></div>`;
	} else {
		imageDisplay.innerHTML = "<span class=\"previewErrorText\">Invalid Image URL!</span>";
	}
}

function showImageFile(fileInput) {
	let fr = new FileReader();

	fr.onload = function() {
		let dataURL = fr.result;
		showImageURL(dataURL);
	}

	fr.readAsDataURL(fileInput.files[0]);
}

// Called
function checkImageFile(fileInput) {
	let imageDisplay = document.getElementById("imagePreview");
	let searchButton = document.getElementById("searchButton");
	let fileMB = fileInput.files[0].size / 1024 / 1024;
	let fileName = fileInput.value.trim().toLowerCase();
	let typeRegex = new RegExp("\.(png|jpe?g|gif|bmp|webp)$");
	let fsizeMax = parseInt((localStorage.getItem("fsizeMax")));

	if (fsizeMax == undefined) {
		fsizeMax = 15; // most common value
	}

	if (fileMB > fsizeMax) {
		// too big
		imageDisplay.innerHTML = "<span class='previewErrorText'>Image Too Large!</span>";
		fileInput.value= ''; // clear file input
		searchButton.classList.remove("searchButtonActive"); // darken search button
		searchReady = false;
	} else if (!(typeRegex.test(fileName))) {
		// bad filetype - should pull type list from db
		imageDisplay.innerHTML = "<span class='previewErrorText'>Image Type Not Supported!</span>";
		fileInput.value= ''; // clear file input
		searchButton.classList.remove("searchButtonActive"); // darken search button
		searchReady = false;
	} else {
		// good - clear the url input and submit if auto
		let urlInput = document.getElementById("urlInput");
		urlInput.value = urlInput.defaultValue; // reset to the default text value
		showImageFile(fileInput); // display new image and activate search button
	}
}

// Called
function getURLInput(urlInput) {
	if (urlInput.value == "") {
		urlInput.value = urlInput.defaultValue; // reset to the default url input text value
	} else {
		document.getElementById("fileInput").value = ""; // clear the file input
		showImageURL(urlInput.value); // show image
		if (document.getElementById("auto-cb").checked) {
			searchReady = false;
			document.getElementById("searchForm").submit();
		}
	}
}

function imageURLError() {
	let imageDisplay = document.getElementById("imagePreview");
	imageDisplay.innerHTML = "<span class=\"previewInfoText\">Image Preview Unavailable</span>";
}

// Called
function clearValue(elem) {
	if (elem.value == elem.defaultValue) {
		elem.value = "";
	}
}

document.onpaste = function(event) {
	urlInput = document.getElementById("urlInput");

	if (event.target == urlInput) {
		// don't interfere with paste to url box - allows ios to paste image links properly
		// give some time for paste to finish normally before checking
		setTimeout(function() { getURLInput(urlInput); }, 4);
		return;
	} else {
		event.preventDefault();
		clipboardData = (event.clipboardData || event.originalEvent.clipboardData);
		if (typeof clipboardData.files[0] == "undefined") {
			urlInput.value = clipboardData.getData('Text');
			getURLInput(urlInput);
		} else {
			fileInput = document.getElementById("fileInput");
			fileInput.files = clipboardData.files;
			checkImageFile(fileInput);
		}
	}
}