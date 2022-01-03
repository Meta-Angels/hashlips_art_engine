const { parse } = require ('csv/sync');
const basePath = process.cwd();
const { NETWORK } = require(`${basePath}/constants/network.js`);
const fs = require("fs");
const _ = require('lodash');
const sha1 = require(`${basePath}/node_modules/sha1`);
const { createCanvas, loadImage } = require(`${basePath}/node_modules/canvas`);
const buildDir = `${basePath}/build`;
const layersDir = `${basePath}/layers`;
const {
  format,
  baseUri,
  description,
  background,
  uniqueDnaTorrance,
  layerConfigurations,
  rarityDelimiter,
  shuffleLayerConfigurations,
  debugLogs,
  extraMetadata,
  text,
  namePrefix,
  network,
  solanaMetadata,
  gif,
} = require(`${basePath}/src/config.js`);
const canvas = createCanvas(format.width, format.height);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = format.smoothing;
var metadataList = [];
var attributesList = [];
var dnaList = new Set();
const DNA_DELIMITER = "-";
const HashlipsGiffer = require(`${basePath}/modules/HashlipsGiffer.js`);
const layersCsvPath = `${basePath}/layers/layers.csv`;

let hashlipsGiffer = null;

const layerTraitCsvNormalizer = (layer, trait) => `${layer.toLowerCase()}#${trait.toLowerCase()}`;

const readLayersCsv = (path) => {
  const layersCsvExist = fs.existsSync(path);

  if (!layersCsvExist) {
    debugLogs && console.log("Layers CSV not provided")
    return {};
  }

  const layersCsvData = fs.readFileSync(path);
  const layersCsvParsed = parse(layersCsvData, {
    columns: true
  });

  debugLogs && console.log(`Layers CSV parsed with ${Object.keys(layersCsvParsed).length} entries`);

  // Normalize each row to include layer and trait
  return layersCsvParsed.reduce((accumulator, cur) => {
    const downstreamTraits = {};

    // Iterate over the current row to get all the downstreat trait rarity (aka rules)
    // TODO: Refactor this
    Object.keys(cur).forEach((header) => {
      // Only iterate over the headers with # since those are traits. The
      // header should always be ${layer}#${trait}
      if (!header.includes('#')) {
        return;
      }

      const value = cur[header];

      // Ignore empty values since we need to have them to make the csv into the matrix
      if (value === '') {
        return;
      }

      // Make a hashmap with these downstream traits
      downstreamTraits[header.toLowerCase()] = Number(value);
    });

    accumulator[layerTraitCsvNormalizer(cur.layer, cur.trait)] = {
      ...cur,
      downstreamTraits
    };

    return accumulator;
  }, {});
}

const buildSetup = () => {
  if (fs.existsSync(buildDir)) {
    fs.rmdirSync(buildDir, { recursive: true });
  }
  fs.mkdirSync(buildDir);
  fs.mkdirSync(`${buildDir}/json`);
  fs.mkdirSync(`${buildDir}/images`);
  if (gif.export) {
    fs.mkdirSync(`${buildDir}/gifs`);
  }
};

const getRarityWeight = (_str) => {
  let nameWithoutExtension = _str.slice(0, -4);
  var nameWithoutWeight = Number(
    nameWithoutExtension.split(rarityDelimiter).pop()
  );
  if (isNaN(nameWithoutWeight)) {
    nameWithoutWeight = 1;
  }
  return nameWithoutWeight;
};

const getRarityWeightFromCsvElement = (elementOnCsv) => {
  return elementOnCsv['rarity'] ? Number(elementOnCsv['rarity']) : undefined;
};

const cleanDna = (_str) => {
  const withoutOptions = removeQueryStrings(_str);
  var dna = Number(withoutOptions.split(":").shift());
  return dna;
};

const cleanName = (_str) => {
  let nameWithoutExtension = _str.slice(0, -4);
  var nameWithoutWeight = nameWithoutExtension.split(rarityDelimiter).shift();
  return nameWithoutWeight;
};

const getElements = (path, layerName, layersCsvData) => {
  return fs
    .readdirSync(path)
    .filter((item) => !/(^|\/)\.[^\/\.]/g.test(item))
    .map((i, index) => {
      const cleanElementName = cleanName(i);
      const normalizedLayerTrait = layerTraitCsvNormalizer(layerName, cleanElementName);
      const elementOnCsv = layersCsvData[normalizedLayerTrait] || {};

      const weight = getRarityWeightFromCsvElement(elementOnCsv) || getRarityWeight(i)
      return {
        id: index,
        name: cleanElementName,
        downstreamTraits: elementOnCsv.downstreamTraits,
        filename: i,
        path: `${path}${i}`,
        weight,
      };
    });
};

const layersSetup = (layersOrder, layersCsvData) => {
  const layers = layersOrder.map((layerObj, index) => ({
    id: index,
    elements: getElements(`${layersDir}/${layerObj.name}/`, layerObj.name, layersCsvData),
    name:
      layerObj.options?.["displayName"] != undefined
        ? layerObj.options?.["displayName"]
        : layerObj.name,
    blend:
      layerObj.options?.["blend"] != undefined
        ? layerObj.options?.["blend"]
        : "source-over",
    opacity:
      layerObj.options?.["opacity"] != undefined
        ? layerObj.options?.["opacity"]
        : 1,
    bypassDNA:
      layerObj.options?.["bypassDNA"] !== undefined
        ? layerObj.options?.["bypassDNA"]
        : false,
  }));
  return layers;
};

const saveImage = (_editionCount) => {
  fs.writeFileSync(
    `${buildDir}/images/${_editionCount}.png`,
    canvas.toBuffer("image/png")
  );
};

const genColor = () => {
  let hue = Math.floor(Math.random() * 360);
  let pastel = `hsl(${hue}, 100%, ${background.brightness})`;
  return pastel;
};

const drawBackground = () => {
  ctx.fillStyle = background.static ? background.default : genColor();
  ctx.fillRect(0, 0, format.width, format.height);
};

const addMetadata = (_dna, _edition) => {
  let dateTime = Date.now();
  let tempMetadata = {
    name: `${namePrefix} #${_edition}`,
    description: description,
    image: `${baseUri}/${_edition}.png`,
    dna: sha1(_dna),
    edition: _edition,
    date: dateTime,
    ...extraMetadata,
    attributes: attributesList,
  };
  if (network == NETWORK.sol) {
    tempMetadata = {
      //Added metadata for solana
      name: tempMetadata.name,
      symbol: solanaMetadata.symbol,
      description: tempMetadata.description,
      //Added metadata for solana
      seller_fee_basis_points: solanaMetadata.seller_fee_basis_points,
      image: `image.png`,
      //Added metadata for solana
      external_url: solanaMetadata.external_url,
      edition: _edition,
      ...extraMetadata,
      attributes: tempMetadata.attributes,
      properties: {
        files: [
          {
            uri: "image.png",
            type: "image/png",
          },
        ],
        category: "image",
        creators: solanaMetadata.creators,
      },
    };
  }
  metadataList.push(tempMetadata);
  attributesList = [];
};

const addAttributes = (_element) => {
  let selectedElement = _element.layer.selectedElement;
  attributesList.push({
    trait_type: _element.layer.name,
    value: selectedElement.name,
  });
};

const loadLayerImg = async (_layer) => {
  return new Promise(async (resolve) => {
    const image = await loadImage(`${_layer.selectedElement.path}`);
    resolve({ layer: _layer, loadedImage: image });
  });
};

const addText = (_sig, x, y, size) => {
  ctx.fillStyle = text.color;
  ctx.font = `${text.weight} ${size}pt ${text.family}`;
  ctx.textBaseline = text.baseline;
  ctx.textAlign = text.align;
  ctx.fillText(_sig, x, y);
};

const drawElement = (_renderObject, _index, _layersLen) => {
  ctx.globalAlpha = _renderObject.layer.opacity;
  ctx.globalCompositeOperation = _renderObject.layer.blend;
  text.only
    ? addText(
        `${_renderObject.layer.name}${text.spacer}${_renderObject.layer.selectedElement.name}`,
        text.xGap,
        text.yGap * (_index + 1),
        text.size
      )
    : ctx.drawImage(
        _renderObject.loadedImage,
        0,
        0,
        format.width,
        format.height
      );

  addAttributes(_renderObject);
};

const constructLayerToDna = (_dna = "", _layers = []) => {
  let mappedDnaToLayers = _layers.map((layer, index) => {
    let selectedElement = layer.elements.find(
      (e) => e.id == cleanDna(_dna.split(DNA_DELIMITER)[index])
    );
    return {
      name: layer.name,
      blend: layer.blend,
      opacity: layer.opacity,
      selectedElement: selectedElement,
    };
  });
  return mappedDnaToLayers;
};

/**
 * In some cases a DNA string may contain optional query parameters for options
 * such as bypassing the DNA isUnique check, this function filters out those
 * items without modifying the stored DNA.
 *
 * @param {String} _dna New DNA string
 * @returns new DNA string with any items that should be filtered, removed.
 */
const filterDNAOptions = (_dna) => {
  const dnaItems = _dna.split(DNA_DELIMITER);
  const filteredDNA = dnaItems.filter((element) => {
    const query = /(\?.*$)/;
    const querystring = query.exec(element);
    if (!querystring) {
      return true;
    }
    const options = querystring[1].split("&").reduce((r, setting) => {
      const keyPairs = setting.split("=");
      return { ...r, [keyPairs[0]]: keyPairs[1] };
    }, []);

    return options.bypassDNA;
  });

  return filteredDNA.join(DNA_DELIMITER);
};

/**
 * Cleaning function for DNA strings. When DNA strings include an option, it
 * is added to the filename with a ?setting=value query string. It needs to be
 * removed to properly access the file name before Drawing.
 *
 * @param {String} _dna The entire newDNA string
 * @returns Cleaned DNA string without querystring parameters.
 */
const removeQueryStrings = (_dna) => {
  const query = /(\?.*$)/;
  return _dna.replace(query, "");
};

const isDnaUnique = (_DnaList = new Set(), _dna = "") => {
  const _filteredDNA = filterDNAOptions(_dna);
  return !_DnaList.has(_filteredDNA);
};

const createDna = (_layers) => {
  let downstreamTraits = {};
  let randNum = [];
  _layers.forEach((layer) => {
    var totalWeight = 0;

    // Poor man array deep clone. Using _ would be useful here
    const elementsClone = _.cloneDeep(layer.elements);

    elementsClone.forEach((element) => {
      // Downstream trait weight take precedence over the element weight
      const downstreamTraitWeight = downstreamTraits[layerTraitCsvNormalizer(layer.name, element.name)];
      if (downstreamTraitWeight !== undefined) {
        // Replace the element weight for the downstream one
        element.weight = downstreamTraitWeight;
      }

      totalWeight += element.weight;
    });
    // number between 0 - totalWeight
    let random = Math.floor(Math.random() * totalWeight);
    for (var i = 0; i < elementsClone.length; i++) {
      // subtract the current weight from the random weight until we reach a sub zero value.
      const currentElement = elementsClone[i];
      random -= currentElement.weight;
      if (random < 0) {
        downstreamTraits = { ...currentElement.downstreamTraits, ...downstreamTraits };
        return randNum.push(
          `${currentElement.id}:${currentElement.filename}${
            layer.bypassDNA ? "?bypassDNA=true" : ""
          }`
        );
      }
    }
  });
  return randNum.join(DNA_DELIMITER);
};

const writeMetaData = (_data) => {
  fs.writeFileSync(`${buildDir}/json/_metadata.json`, _data);
};

const saveMetaDataSingleFile = (_editionCount) => {
  let metadata = metadataList.find((meta) => meta.edition == _editionCount);
  debugLogs
    ? console.log(
        `Writing metadata for ${_editionCount}: ${JSON.stringify(metadata)}`
      )
    : null;
  fs.writeFileSync(
    `${buildDir}/json/${_editionCount}.json`,
    JSON.stringify(metadata, null, 2)
  );
};

function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}

const startCreating = async () => {
  let layerConfigIndex = 0;
  let editionCount = 1;
  let failedCount = 0;
  let abstractedIndexes = [];
  const csvData = readLayersCsv(layersCsvPath);
  for (
    let i = network == NETWORK.sol ? 0 : 1;
    i <= layerConfigurations[layerConfigurations.length - 1].growEditionSizeTo;
    i++
  ) {
    abstractedIndexes.push(i);
  }
  if (shuffleLayerConfigurations) {
    abstractedIndexes = shuffle(abstractedIndexes);
  }
  debugLogs
    ? console.log("Editions left to create: ", abstractedIndexes)
    : null;
  while (layerConfigIndex < layerConfigurations.length) {
    const layers = layersSetup(
      layerConfigurations[layerConfigIndex].layersOrder,
      csvData
    );
    while (
      editionCount <= layerConfigurations[layerConfigIndex].growEditionSizeTo
    ) {
      let newDna = createDna(layers);
      if (isDnaUnique(dnaList, newDna)) {
        let results = constructLayerToDna(newDna, layers);
        let loadedElements = [];

        results.forEach((layer) => {
          loadedElements.push(loadLayerImg(layer));
        });

        await Promise.all(loadedElements).then((renderObjectArray) => {
          debugLogs ? console.log("Clearing canvas") : null;
          ctx.clearRect(0, 0, format.width, format.height);
          if (gif.export) {
            hashlipsGiffer = new HashlipsGiffer(
              canvas,
              ctx,
              `${buildDir}/gifs/${abstractedIndexes[0]}.gif`,
              gif.repeat,
              gif.quality,
              gif.delay
            );
            hashlipsGiffer.start();
          }
          if (background.generate) {
            drawBackground();
          }
          renderObjectArray.forEach((renderObject, index) => {
            drawElement(
              renderObject,
              index,
              layerConfigurations[layerConfigIndex].layersOrder.length
            );
            if (gif.export) {
              hashlipsGiffer.add();
            }
          });
          if (gif.export) {
            hashlipsGiffer.stop();
          }
          debugLogs
            ? console.log("Editions left to create: ", abstractedIndexes)
            : null;
          saveImage(abstractedIndexes[0]);
          addMetadata(newDna, abstractedIndexes[0]);
          // saveMetaDataSingleFile(abstractedIndexes[0]);
          console.log(
            `Created edition: ${abstractedIndexes[0]}, with DNA: ${sha1(
              newDna
            )}`
          );
        });
        dnaList.add(filterDNAOptions(newDna));
        editionCount++;
        abstractedIndexes.shift();
      } else {
        console.log("DNA exists!");
        failedCount++;
        if (failedCount >= uniqueDnaTorrance) {
          console.log(
            `You need more layers or elements to grow your edition to ${layerConfigurations[layerConfigIndex].growEditionSizeTo} artworks!`
          );
          process.exit();
        }
      }
    }
    layerConfigIndex++;
  }

  // Rarity calculations
  const rarityPerTrait = {};
  const totalEditions = metadataList.length;

  // Get per attribute and layer an ocurrence count and a running score
  metadataList.forEach(({ attributes }) => {
    attributes.forEach(({ trait_type, value }) => {
      normalizedTrait = layerTraitCsvNormalizer(trait_type, value);

      rarityPerTrait[normalizedTrait] ||= { ocurrence: 0, score: 0 };
      rarityPerTrait[normalizedTrait].ocurrence = rarityPerTrait[normalizedTrait].ocurrence + 1;
      rarityPerTrait[normalizedTrait].score = (1/(rarityPerTrait[normalizedTrait].ocurrence/totalEditions));
    });
  });

  // Write out all rarities
  var rarityWriter = fs.createWriteStream(`${buildDir}/rarity.txt`);

  Object.keys(rarityPerTrait).forEach((normalizedTrait) => {
    const { ocurrence, score } = rarityPerTrait[normalizedTrait];

    const chance = ((ocurrence/totalEditions) * 100);
    rarityWriter.write(`${normalizedTrait} - ${ocurrence} in ${totalEditions} editions - ${chance}% - ${score.toFixed(2)} rarity score\n`);
  });

  rarityWriter.end();

  // Rarity score calculations

  // Do a first pass to calculate all scores per edition
  metadataList.forEach((metadata) => {
    let score = 0;

    metadata.attributes.forEach(({ trait_type, value }) => {
      normalizedTrait = layerTraitCsvNormalizer(trait_type, value);

      score += rarityPerTrait[normalizedTrait].score;
    });

    metadata.score = score;
  });

  const sortedMetadataList = _.sortBy(metadataList, ['score']);

  // Do a second pass to add all rankings
  sortedMetadataList.forEach((metadata, index) => {
    const currentMetadata = metadataList[Number(metadata.edition) - 1];
    currentMetadata.attributes.push({
      trait_type: "Rarity Rank (#1 Rarest)", 
      value: totalEditions - index,
      max_value: totalEditions
    });
  });

  // Do a third pass to print out each of the files metada. I know... this could be smarter but why bother
  metadataList.forEach(({ edition: editionNumber }) => {
    saveMetaDataSingleFile(editionNumber);
  });

  // Write it all out
  writeMetaData(JSON.stringify(metadataList, null, 2));
};

module.exports = { startCreating, buildSetup, getElements, readLayersCsv };
