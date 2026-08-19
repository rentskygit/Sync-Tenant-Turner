const Airtable = require('airtable');
const axios = require('axios');

// ========================================
// CONFIGURACIÓN
// ========================================
const airtable = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
});
const base = airtable.base(process.env.AIRTABLE_BASE_ID);

const TENANT_TURNER_API_KEY = process.env.TENANT_TURNER_API_KEY;
const TENANT_TURNER_API_URL = 'https://api.tenantturner.com/v1/properties';

// ========================================
// MAPEO DE CAMPOS SEGÚN DOCUMENTACIÓN DE TT
// ========================================
function mapPropertyData(record) {
    const fields = record.fields;
    
    // Mapear tipo de propiedad
    const propertyTypeMap = {
        'Apartamento': 'apartment',
        'Casa': 'house',
        'Condo': 'condo',
        'Estudio': 'studio',
        'Duplex': 'duplex'
    };

    // Mapear plazo de arrendamiento
    const leaseTermMap = {
        '6 meses': '6',
        '12 meses': '12',
        '24 meses': '24',
        'Mes a mes': 'monthly'
    };

    // Construir objeto según la documentación de Tenant Turner
    return {
        // Campos OBLIGATORIOS según documentación
        address: fields.Address || '',
        city: fields.City || '',
        state: fields.State || '',
        zipCode: fields.Zip ? String(fields.Zip) : '',
        propertyType: propertyTypeMap[fields['Rental Type']] || 'apartment',
        description: fields.Description || '',
        
        // Fotos - OBLIGATORIO (array de objetos con url)
        photos: fields['Upload photos'] ? fields['Upload photos'].map(img => ({
            url: img.url,
            isPrimary: false
        })) : [{ url: 'https://via.placeholder.com/800x600?text=No+Image', isPrimary: true }],
        
        // Características - OBLIGATORIO (objeto)
        propertyFeatures: {
            parking: fields.Parking || '',
            parkingSpots: parseInt(fields.Spot) || 0,
            cooling: fields['Cooling system'] || '',
            heating: fields['Heater system'] || '',
            laundry: fields.Laundry || ''
        },
        
        // Amenidades - OBLIGATORIO (array de strings)
        propertyAmenities: fields.Amenities || [],
        
        // Campos opcionales
        address2: fields.Unit ? `#${fields.Unit}` : '',
        descriptionTitle: fields['Description Title'] || '',
        bedrooms: parseInt(fields.Beds) || 0,
        bathrooms: parseFloat(fields.Bathrooms) || 0,
        squareFeet: parseInt(fields['Square Fee']) || 0,
        rentAmount: parseFloat(fields.Price) || 0,
        depositAmount: parseFloat(fields.Deposit) || 0,
        availableDate: fields['Date Available For Move-In'] || '',
        minimumLeaseTerm: leaseTermMap[fields['Lease Term']] || '12',
        virtualTour: fields['Visual Tour'] || '',
        
        // Servicios incluidos (utilities) como array
        utilities: fields.Utilities || []
    };
}

// ========================================
// FUNCIONES PRINCIPALES
// ========================================

async function getPropertiesFromAirtable() {
    const records = [];
    
    await base('Automatic apartments')
        .select({
            filterByFormula: `{Published} = FALSE()`,
            maxRecords: 10
        })
        .eachPage((pageRecords, fetchNextPage) => {
            records.push(...pageRecords);
            fetchNextPage();
        });
    
    console.log(`📊 Encontradas ${records.length} propiedades para publicar`);
    return records;
}

async function createPropertyInTenantTurner(propertyData) {
    // 🔑 Codificar la API Key en Base64 para Basic Auth
    const encodedApiKey = Buffer.from(TENANT_TURNER_API_KEY).toString('base64');
    
    console.log(`🔑 Longitud de la API Key: ${TENANT_TURNER_API_KEY?.length || 0}`);
    console.log(`🔑 Primeros 5 caracteres: ${TENANT_TURNER_API_KEY?.substring(0, 5) || 'VACÍA'}`);
    console.log(`📤 Enviando a Tenant Turner: ${propertyData.address}`);
    
    try {
        const response = await axios.post(TENANT_TURNER_API_URL, propertyData, {
            headers: {
                'Authorization': `Basic ${encodedApiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`✅ Propiedad creada exitosamente: ${propertyData.address}`);
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error(`❌ Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            console.error(`📋 Headers enviados: ${JSON.stringify(error.config.headers)}`);
        } else {
            console.error(`❌ Error de red: ${error.message}`);
        }
        throw error;
    }
}

async function markAsPublished(recordId) {
    await base('Automatic apartments').update(recordId, {
        Published: true,
        'Date Published': new Date().toISOString()
    });
    console.log(`📝 Marcado como publicado el registro ${recordId}`);
}

// ========================================
// FUNCIÓN PRINCIPAL
// ========================================

async function main() {
    console.log('🚀 Iniciando sincronización con Tenant Turner...');
    console.log(`⏰ ${new Date().toLocaleString()}`);
    
    try {
        const properties = await getPropertiesFromAirtable();
        
        if (properties.length === 0) {
            console.log('ℹ️ No hay propiedades pendientes de publicación');
            return;
        }
        
        for (const record of properties) {
            try {
                // 1. Mapear datos
                const propertyData = mapPropertyData(record);
                
                // 2. Enviar a Tenant Turner
                await createPropertyInTenantTurner(propertyData);
                
                // 3. Marcar como publicado en Airtable
                await markAsPublished(record.id);
                
            } catch (error) {
                console.error(`❌ Falló la propiedad ${record.id}`);
                // Continuar con la siguiente propiedad
            }
        }
        
        console.log('✅ Sincronización completada');
        
    } catch (error) {
        console.error('❌ Error en el proceso principal:', error.message);
        process.exit(1);
    }
}

// ========================================
// EJECUCIÓN
// ========================================

// Validar variables de entorno
const requiredEnv = ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'TENANT_TURNER_API_KEY'];
const missing = requiredEnv.filter(key => !process.env[key]);

if (missing.length > 0) {
    console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
    process.exit(1);
}

main();
