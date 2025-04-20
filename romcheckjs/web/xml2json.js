//https://github.com/Leonidas-from-XIV/node-xml2js/issues/277
// Recursive function to convert XML elements to JSON
function parseElement(xmlElement) {
  let result = {}
  if (xmlElement.nodeType === Node.ELEMENT_NODE) {
    result.$ = parseAttributes(xmlElement)
    if (xmlElement.children.length === 0) {
      if (xmlElement.attributes.length > 0)
        if (xmlElement.textContent == "")
          return { $: parseAttributes(xmlElement) }
        else
          return { _: xmlElement.textContent, $: parseAttributes(xmlElement) }
      else return xmlElement.textContent
    } else {
      // If the element has child elements, recursively convert them to JSON
      for (const childElement of xmlElement.children) {
        const key = childElement.tagName
        const value = parseElement(childElement)
        // If the key already exists, convert the value to an array
        if (result[key]) {
          if (!Array.isArray(result[key]))
            result[key] = [result[key]]
          result[key].push(value)
        } else
          result[key] = value
      }
    }
  }
  return result
}

function parseElement2(xmlElement) {
  let result = {}
  if (xmlElement.nodeType === Node.ELEMENT_NODE) {
    result.$ = parseAttributes(xmlElement)

    for (const childElement of xmlElement.children) {
      //      if (Object.keys(result).length === 0) return xmlElement.textContent

      const key = childElement.tagName
      const value = parseElement(childElement)
      //value.$ = parseAttributes(childElement)

      if (result[key]) {
        if (!Array.isArray(result[key]))
          result[key] = [result[key]]
        result[key].push(value)
      } else
        result[key] = value
    }
  }
  return result
}

function parseAttributes(xmlElement) {
  if (xmlElement.attributes.length > 0) {
    let a = {}
    for (const attribute of xmlElement.attributes)
      a[attribute.name] = attribute.value
    return a
  }
}

function xml2js(xmlData) {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlData, 'text/xml')
  return parseElement(xmlDoc.documentElement)
}

// Example usage:
const xmlData = `
  <root>
    <name type="first">John</name>
    <age type="years">30</age>
    <address type="incomplete">
      xxx
      <city st="NY">New York</city>
      <country>USA</country>
    </address>
  </root>`

console.log(JSON.stringify(xml2js(xmlData), 1, 2))

