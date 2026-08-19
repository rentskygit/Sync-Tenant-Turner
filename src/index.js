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
// MAPEO CON NOMBRES CORRECTOS DE AIRTABLE
// ========================================
function mapPropertyData(record) {
    const fields = record.fields;
    
    // 🔍 LOG DE CAMPOS DISPONIBLES
    console.log('📋 Campos disponibles en Airtable:', Object.keys(fields));
    console.log('📋 Valores importantes:', {
        'Square Fee': fields['Square Fee'],
        'Price': fields.Price,
        'Address': fields.Address,
        'PropertyType': fields.PropertyType
    });
    
    // ============================================
    // VALIDACIÓN DE CAMPOS CON NOMBRES DE AIRTABLE
    // ============================================
    
    // Square Feet - En Airtable se llama "Square Fee"
    let squareFeet = parseInt(fields['Square Fee']) || 850;
    if (squareFeet < 100) squareFeet = 850;
    if (squareFeet > 20000) squareFeet = 20000;
    
    // Rent Amount - En Airtable se llama "Price"
    let rentAmount = parseFloat(fields.Price) || 1500;
    rentAmount = Math.round(rentAmount * 100) / 100;
    if (rentAmount < 100) rentAmount = 1500;
    if (rentAmount > 10000) rentAmount = 10000;
    
    // Deposit - En Airtable se llama "Deposit"
    let depositAmount = parseFloat(fields.Deposit) || 0;
    depositAmount = Math.round(depositAmount * 100) / 100;
    
    // ============================================
    // CONSTRUCCIÓN DEL OBJETO
    // ============================================
    return {
        // Campos obligatorios
        address: fields.Address || '',
        city: fields.City || '',
        state: fields.State || '',
        zipCode: fields.Zip ? String(fields.Zip).padStart(5, '0') : '00000',
        propertyType: fields.PropertyType || 'Apartment Unit',
        description: fields.Description || '',
        
        // Fotos - Obligatorio
        photos: fields['Upload photos'] ? fields['Upload photos'].map(img => ({
            url: img.url,
            isPrimary: false
        })) : [{ url: 'https://via.placeholder.com/800x600?text=No+Image', isPrimary: true }],
        
        // Características - Obligatorio
        propertyFeatures: {
            parking: fields.ParkingType || 'None',
            parkingSpots: parseInt(fields.Spot) || 0,
            cooling: fields.CoolingSystem || 'None',
            heating: fields.HeaterSystem || 'None',
            laundry: fields.Laundry || 'None'
        },
        
        // Amenidades - Obligatorio
        propertyAmenities: fields.Amenities || [],
        
        // Owners - Obligatorio
        owners: [
            {
                name: fields.OwnerName || 'Propietario Principal',
                email: fields.OwnerEmail || 'owner@example.com',
                phone: fields.OwnerPhone ? `1${fields.OwnerPhone.replace(/\D/g, '')}` : '13055551234'
            }
        ],
        
        // Occupants - Obligatorio
        occupants: [
            {
                name: 'Sin ocupantes',
                email: 'none@example.com',
                phone: '13055550000'
            }
        ],
        
        // Campos opcionales CON VALORES VÁLIDOS
        address2: fields.Unit || '',
        descriptionTitle: fields['Description Title'] || '',
        bedrooms: parseInt(fields.Beds) || 0,
        bathrooms: parseFloat(fields.Bathrooms) || 0,
        squareFeet: squareFeet, // ← Mapeado desde "Square Fee"
        rentAmount: rentAmount, // ← Mapeado desde "Price"
        depositAmount: depositAmount, // ← Mapeado desde "Deposit"
        availableDate: fields['Date Available For Move-In'] || '',
        minimumLeaseTerm: fields.LeaseTerm || 'One Year',
        virtualTour: fields['Visual Tour'] || '',
        utilities: fields.UtilitiesIncluded || []
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
    const encodedApiKey = Buffer.from(TENANT_TURNER_API_KEY).toString('base64');
    
    console.log(`🔑 Longitud de la API Key: ${TENANT_TURNER_API_KEY?.length || 0}`);
    console.log(`🔑 Primeros 5 caracteres: ${TENANT_TURNER_API_KEY?.substring(0, 5) || 'VACÍA'}`);
    console.log(`📤 Enviando a Tenant Turner: ${propertyData.address}`);
    
    // Log detallado del payload con los valores corregidos
    console.log('📋 Payload (valores clave):', JSON.stringify({
        address: propertyData.address,
        squareFeet: propertyData.squareFeet,
        rentAmount: propertyData.rentAmount,
        depositAmount: propertyData.depositAmount,
        propertyType: propertyData.propertyType,
        leaseTerm: propertyData.minimumLeaseTerm
    }, null, 2));
    
    try {
        const response = await axios.post(TENANT_TURNER_API_URL, propertyData, {
            headers: {
                'Authorization': `Basic ${encodedApiKey}`,
                'Content-Type': 'application/json'
            },
            family: 4,
            timeout: 30000
        });
        
        console.log(`✅ Propiedad creada exitosamente: ${propertyData.address}`);
        console.log(`📋 ID en Tenant Turner: ${response.data?.id || 'N/A'}`);
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error(`❌ Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
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
                const propertyData = mapPropertyData(record);
                await createPropertyInTenantTurner(propertyData);
                await markAsPublished(record.id);
            } catch (error) {
                console.error(`❌ Falló la propiedad ${record.id}`);
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

const requiredEnv = ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'TENANT_TURNER_API_KEY'];
const missing = requiredEnv.filter(key => !process.env[key]);

if (missing.length > 0) {
    console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
    process.exit(1);
}

main();
