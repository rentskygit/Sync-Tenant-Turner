const Airtable = require('airtable');
const axios = require('axios');
const airtable = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
});
const base = airtable.base(process.env.AIRTABLE_BASE_ID);

const TENANT_TURNER_API_KEY = process.env.TENANT_TURNER_API_KEY;
const TENANT_TURNER_API_URL = 'https://api.tenantturner.com/v1/properties';

function mapPropertyData(record) {
    const fields = record.fields;


    
    // ============================================
    // VALIDACIÓN DE CAMPOS NUMÉRICOS
    // ============================================
    
    let squareFootage = parseInt(fields['Square Fee']);
    if (squareFootage < 100) squareFootage = 100;
    if (squareFootage > 20000) squareFootage = 20000;
    
    let rentAmount = parseFloat(fields.Price);
    rentAmount = Math.round(rentAmount * 100) / 100;
    if (rentAmount < 100) rentAmount = 100;
    if (rentAmount > 100000) rentAmount = 100000;
    
    let depositAmount = parseFloat(fields.Deposit) || 0;
    depositAmount = Math.round(depositAmount * 100) / 100;
    
    let parkingCount = parseInt(fields.Spot) || 0;
    
    const utilities = fields.Utilities || [];
    const rentIncludes = {
        rentIncludesTrash: utilities.includes('trash'),
        rentIncludesWater: utilities.includes('water'),
        rentIncludesElectricity: utilities.includes('electricity'),
        rentIncludesGas: utilities.includes('gas'),
        rentIncludesCable: utilities.includes('cable'),
        rentIncludesInternet: utilities.includes('internet')
    };
    
    const propertyData = {
        address: fields.Address || '',
        city: fields.City || '',
        state: fields.State || '',
        zipCode: fields.Zip ? String(fields.Zip).padStart(5, '0') : '00000',
        propertyType: fields['Rental Type'] || 'Apartment Unit',
        description: fields.Description || '',
        
        photos: fields['Upload photos '] ? fields['Upload photos '].map((img, index) => ({
            url: img.url,
            order: index
        })) : [{ url: 'https://via.placeholder.com/800x600?text=No+Image', order: 0 }],
        
        owners: [
            {
                email: fields['Owner Email'] || 'owner@example.com'
            }
        ],
        
        occupants: [
            {
                phone: '13055550000',
                email: 'none@example.com'
            }
        ],
        
        propertyFeatures: {
            laundry: laundryMap[fields.Laundry] || fields.Laundry || 'None',
            parkingType: parkingMap[fields.Parking] || fields.Parking || 'None',
            parkingCount: parkingCount,
            coolingSystem: coolingMap[fields['Cooling system']] || fields['Cooling system'] || 'None',
            heatingSystem: heatingMap[fields['Heater system']] || fields['Heater system'] || 'None',
            ...rentIncludes
        },
        
        propertyAmenities: fields.Amenities || [],
        
        
        assignedUserEmail: 'Cmelo@jcmrealtygroup.com',
        
        dateAvailable: fields['Date Available For Move-In'] || '',
        
        descriptiveTitle: fields['Description Title'] || '',
        
        squareFootage: squareFootage,
        
        rentAmount: rentAmount,
        
        depositAmount: depositAmount,
        
        minimumLeaseTerm: fields['Lease Term'] || 'One Year',
        
        address2: fields.Unit || '',
        bedrooms: parseInt(fields.Beds) || 0,
        bathrooms: parseFloat(fields.Bathrooms) || 0,
        virtualTour: fields['Visual Tour'] || ''
    };
    
    console.log('📋 ====== PAYLOAD ======');
    console.log(`  address: ${propertyData.address}`);
    console.log(`  propertyType: ${propertyData.propertyType}`);
    console.log(`  assignedUserEmail: ${propertyData.assignedUserEmail}`);
    console.log(`  dateAvailable: ${propertyData.dateAvailable}`);
    console.log(`  descriptiveTitle: ${propertyData.descriptiveTitle}`);
    console.log(`  squareFootage: ${propertyData.squareFootage}`);
    console.log(`  rentAmount: ${propertyData.rentAmount}`);
    console.log(`  minimumLeaseTerm: ${propertyData.minimumLeaseTerm}`);
    console.log(`  propertyFeatures:`);
    console.log(`    parkingType: ${propertyData.propertyFeatures.parkingType}`);
    console.log(`    parkingCount: ${propertyData.propertyFeatures.parkingCount}`);
    console.log(`    coolingSystem: ${propertyData.propertyFeatures.coolingSystem}`);
    console.log(`    heatingSystem: ${propertyData.propertyFeatures.heatingSystem}`);
    console.log(`    laundry: ${propertyData.propertyFeatures.laundry}`);
    console.log(`    rentIncludesTrash: ${propertyData.propertyFeatures.rentIncludesTrash}`);
    console.log(`    rentIncludesWater: ${propertyData.propertyFeatures.rentIncludesWater}`);
    console.log(`    rentIncludesElectricity: ${propertyData.propertyFeatures.rentIncludesElectricity}`);
    console.log(`    rentIncludesGas: ${propertyData.propertyFeatures.rentIncludesGas}`);
    console.log(`    rentIncludesCable: ${propertyData.propertyFeatures.rentIncludesCable}`);
    console.log(`    rentIncludesInternet: ${propertyData.propertyFeatures.rentIncludesInternet}`);
    console.log(`  propertyAmenities: [${propertyData.propertyAmenities.join(', ')}]`);
    console.log('===============================================\n');
    
    return propertyData;
}


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
    
    console.log(`📤 Enviando a Tenant Turner: ${propertyData.address}`);
    
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
            console.error('📋 Payload que causó el error:', JSON.stringify(propertyData, null, 2));
        } else {
            console.error(`❌ Error de red: ${error.message}`);
        }
        throw error;
    }
}

async function markAsPublished(recordId) {
    try {
        await base('Automatic apartments').update(recordId, {
            'Published': true
        });
        console.log(`📝 Marcado como publicado el registro ${recordId}`);
    } catch (error) {
        console.error(`❌ Error al marcar como publicado: ${error.message}`);
    }
}

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


const requiredEnv = ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'TENANT_TURNER_API_KEY'];
const missing = requiredEnv.filter(key => !process.env[key]);

if (missing.length > 0) {
    console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
    process.exit(1);
}

main();
