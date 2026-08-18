const Airtable = require('airtable');
const axios = require('axios');

// Configuración de Airtable
const airtable = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
});
const base = airtable.base(process.env.AIRTABLE_BASE_ID);

// Configuración de Tenant Turner
const TENANT_TURNER_API_KEY = process.env.TENANT_TURNER_API_KEY;
const TENANT_TURNER_API_URL = 'https://api.tenantturner.com/v1/properties'; // URL de ejemplo

async function getPropertiesFromAirtable() {
    const records = [];
    await base('Propiedades')
        .select({
            filterByFormula: `{Publicado} = FALSE()`, // Solo propiedades no publicadas
            fields: ['Direccion', 'Precio', 'Habitaciones', 'Baños', 'Descripcion', 'Imagenes']
        })
        .eachPage((pageRecords, fetchNextPage) => {
            records.push(...pageRecords);
            fetchNextPage();
        });
    return records;
}

async function createPropertyInTenantTurner(record) {
    const propertyData = {
        address: record.fields.Direccion,
        price: record.fields.Precio,
        bedrooms: record.fields.Habitaciones,
        bathrooms: record.fields.Baños,
        description: record.fields.Descripcion,
        // Las imágenes se manejan como URLs o archivos, según la API de TT
        images: record.fields.Imagenes || []
    };

    try {
        const response = await axios.post(TENANT_TURNER_API_URL, propertyData, {
            headers: {
                'Authorization': `Bearer ${TENANT_TURNER_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ Propiedad creada en Tenant Turner: ${record.fields.Direccion}`);
        return response.data;
    } catch (error) {
        console.error(`❌ Error creando propiedad: ${error.message}`);
        throw error;
    }
}

async function markAsPublished(recordId) {
    await base('Propiedades').update(recordId, {
        Publicado: true,
        FechaPublicacion: new Date().toISOString()
    });
}

async function main() {
    console.log('🚀 Iniciando sincronización con Tenant Turner...');
    
    const properties = await getPropertiesFromAirtable();
    console.log(`📊 Encontradas ${properties.length} propiedades para publicar`);
    
    for (const record of properties) {
        try {
            await createPropertyInTenantTurner(record);
            await markAsPublished(record.id);
        } catch (error) {
            console.error(`❌ Falló la propiedad ${record.id}: ${error.message}`);
            // Continuamos con la siguiente
        }
    }
    
    console.log('✅ Sincronización completada');
}

main();
